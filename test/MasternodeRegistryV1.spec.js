// Copyright 2019 The Energi Core Authors
// This file is part of Energi Core.
//
// Energi Core is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Energi Core is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Energi Core. If not, see <http://www.gnu.org/licenses/>.

// Energi Governance system is the fundamental part of Energi Core.

'use strict';

const MockProxy = artifacts.require('MockProxy');
const MockContract = artifacts.require('MockContract');
const MasternodeRegistryV1 = artifacts.require('MasternodeRegistryV1');
const IBlockReward = artifacts.require('IBlockReward');
const IMasternodeRegistry = artifacts.require('IMasternodeRegistry');
const IMasternodeToken = artifacts.require('IMasternodeToken');
const ITreasury = artifacts.require('ITreasury');
const StorageMasternodeRegistryV1 = artifacts.require('StorageMasternodeRegistryV1');

const common = require('./common');

contract("MasternodeRegistryV1", async accounts => {
    const s = {
        artifacts,
        accounts,
        assert,
        it,
        web3,
        storage: null,
    };

    const { toWei } = web3.utils;
    
    before(async () => {
        s.orig = await MasternodeRegistryV1.deployed();
        s.proxy = await MockProxy.at(await s.orig.proxy());
        await s.proxy.setImpl(s.orig.address);

        s.fake = await MockContract.new(s.proxy.address);
        s.proxy_abi = await MasternodeRegistryV1.at(s.proxy.address);

        s.token_abi = await IMasternodeRegistry.at(s.proxy.address);
        s.reward_abi = await IBlockReward.at(s.proxy.address);
        s.storage = await StorageMasternodeRegistryV1.at(await s.proxy_abi.v1storage());

        s.mntoken_proxy_addr = await s.orig.token_proxy();
        //s.mntoken_proxy = await MockProxy.at(s.mntoken_proxy_addr);
        s.mntoken_abi = await IMasternodeToken.at(s.mntoken_proxy_addr);

        s.treasury_proxy_addr = await s.orig.treasury_proxy();
        s.treasury_proxy = await MockProxy.at(s.treasury_proxy_addr);
        s.treasury_abi = await ITreasury.at(s.treasury_proxy_addr);
        s.treasury_impl = await ITreasury.at(await s.treasury_proxy.impl());

        Object.freeze(s);
    });

    after(async () => {
        const impl = await MasternodeRegistryV1.new(
            s.proxy.address,
            s.mntoken_proxy_addr,
            s.treasury_proxy_addr,
            common.mnregistry_config
        );
        await s.proxy.setImpl(impl.address);
    });

    describe('common pre', () => common.govPreTests(s) );

    //---
    describe('Primary', () => {
        const { fromAscii, toBN } = web3.utils;

        const collateral1 = toWei('30000', 'ether');
        const collateral2 = toWei('20000', 'ether');
        const collateral3 = toWei('10000', 'ether');
        const reward = toBN(toWei('9.14', 'ether'));

        const owner1 = accounts[0];
        const owner2 = accounts[1];
        const owner3 = accounts[2];
        const not_owner = accounts[3];

        const masternode1 = accounts[9];
        const masternode2 = accounts[8];
        const masternode3 = accounts[7];

        const ip1 = toBN(0x12345678);
        const ip2 = toBN(0x87654321);
        const ip3 = toBN(0x43218765);

        const enode_common = '123456789012345678901234567890'
        const enode1 = [fromAscii(enode_common + '11'), fromAscii(enode_common + '11')];
        const enode2 = [fromAscii(enode_common + '11'), fromAscii(enode_common + '22')];
        const enode3 = [fromAscii(enode_common + '11'), fromAscii(enode_common + '33')];

        before(async () => {
            await s.mntoken_abi.depositCollateral({
                from: owner1,
                value: collateral1,
            });
            await s.mntoken_abi.depositCollateral({
                from: owner2,
                value: collateral2,
            });
            await s.mntoken_abi.depositCollateral({
                from: owner3,
                value: collateral3,
            });
        });

        after(async () => {
            await s.mntoken_abi.withdrawCollateral(collateral1, {
                from: owner1,
            });
            await s.mntoken_abi.withdrawCollateral(collateral2, {
                from: owner2,
            });
            await s.mntoken_abi.withdrawCollateral(collateral3, {
                from: owner3,
            });
        });

        describe('No MN', () => {
            it('should silently denounce()', async () => {
                await s.token_abi.denounce(masternode1);
                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(0);
            });

            it('should refuse to heartbeat() too old block', async () => {
                const bn = await web3.eth.getBlockNumber();
                const b = await web3.eth.getBlock(bn);

                try {
                    await s.token_abi.heartbeat(bn - 10, b.hash, '0', common.zerofee_callopts);
                    assert.fail('It should fail');
                } catch(e) {
                    assert.match(e.message, /Too old/);
                }
            });

            it('should refuse to heartbeat() wrong block', async () => {
                const bn = (await web3.eth.getBlockNumber());
                const b = await web3.eth.getBlock(bn);

                try {
                    await s.token_abi.heartbeat(bn - 9, b.hash, '0', common.zerofee_callopts);
                    assert.fail('It should fail');
                } catch(e) {
                    assert.match(e.message, /Block mismatch/);
                }
            });

            it('should refuse to heartbeat() not active', async () => {
                const bn = await web3.eth.getBlockNumber();
                const b = await web3.eth.getBlock(bn);

                try {
                    await s.token_abi.heartbeat(bn, b.hash, '0', common.zerofee_callopts);
                    assert.fail('It should fail');
                } catch(e) {
                    assert.match(e.message, /Not active/);
                }
            });

            it('should refuse to validate() vote for self', async () => {
                try {
                    await s.token_abi.validate(owner1, common.zerofee_callopts);
                    assert.fail('It should fail');
                } catch(e) {
                    assert.match(e.message, /Vote for self/);
                }
            });

            it('should refuse to validate() not active', async () => {
                try {
                    await s.token_abi.validate(masternode2, common.zerofee_callopts);
                    assert.fail('It should fail');
                } catch(e) {
                    assert.match(e.message, /Not active caller/);
                }
            });

            it('should not be isValid()', async () => {
                const res = await s.token_abi.isValid(masternode1);
                expect(res).false;
            });

            it('should correctly count()', async () => {
                const res = await s.token_abi.count();
                assert.equal(res[0], 0);
                assert.equal(res[1], 0);
                assert.equal(res[2], 0);
            });

            it('should handle info()', async () => {
                try {
                    await s.token_abi.info(masternode1);
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Unknown masternode/);
                }
            });

            it('should handle ownerInfo()', async () => {
                try {
                    await s.token_abi.ownerInfo(owner1);
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Unknown owner/);
                }
            });

            it('should process reward() to Treasury', async () => {
                const treasury_before = toBN(await web3.eth.getBalance(s.treasury_impl.address));

                let r = await s.reward_abi.getReward(0);
                assert.equal(r.valueOf(), 0);

                const count = 3;
                
                for (let i = count; i > 0; --i) {
                    r = await s.reward_abi.getReward(i);

                    if (r.eq(toBN(0))) {
                        // superblock case
                        r = await s.reward_abi.getReward(i+1);
                    }

                    expect(r.toString()).eql(reward.toString());
                    await s.reward_abi.reward({
                        from: accounts[0],
                        value: r
                    });
                }

                // Kick the rest
                await s.reward_abi.reward();

                const treasury_after = toBN(await web3.eth.getBalance(s.treasury_impl.address));
                expect(treasury_after.sub(treasury_before).toString())
                    .eql(reward.mul(toBN(count)).toString());
            });

            it('should handle onCollateralUpdate()', async () => {
                await s.token_abi.onCollateralUpdate(owner1);
            });

            it('should handle enumerate()', async () => {
                expect(await s.token_abi.enumerate()).lengthOf(0);
            });

            it.skip('must forbid more than one reward() per block', async () => {
                // Bug: https://github.com/trufflesuite/truffle/issues/1389
                const batch = web3.eth.BatchRequest();
                batch.add(s.reward_abi.reward.request({value: reward}));
                batch.add(s.reward_abi.reward.request({value: reward}));

                try {
                    await batch.execute();
                    assert.fail('It must fail');
                } catch (e) {
                    assert.match(e.message, /Call outside of governance/);
                }
            });
        });

        describe('Single MN', () => {
            let announced_block;

            it('should refuse announce() without collateral', async () => {
                try {
                    await s.token_abi.announce(
                        masternode1, ip1, enode1, { from: not_owner });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Invalid collateral/);
                }

                expect(await s.orig.getPastEvents('Announced', common.evt_last_block)).lengthOf(0);
            });

            it('should refuse announce() local IPs', async () => {
                try {
                    await s.token_abi.announce(
                        masternode1, 0x7F000001, enode1, { from: owner1 });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Wrong IP/);
                }
                try {
                    await s.token_abi.announce(
                        masternode1, 0x0A000001, enode1, { from: owner1 });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Wrong IP/);
                }
                try {
                    await s.token_abi.announce(
                        masternode1, 0xC0A80001, enode1, { from: owner1 });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Wrong IP/);
                }
                try {
                    await s.token_abi.announce(
                        masternode1, 0xAC100001, enode1, { from: owner1 });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Wrong IP/);
                }
                try {
                    await s.token_abi.announce(
                        masternode1, 0xAC1F0001, enode1, { from: owner1 });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Wrong IP/);
                }
            });

            it('should announce()', async () => {
                const res = await s.mntoken_abi.balanceInfo(owner1);
                assert.equal(res['0'].valueOf(), collateral1);

                await s.token_abi.announce(
                    masternode1, ip1, enode1, { from: owner1 });

                const ann_e = await s.orig.getPastEvents('Announced', common.evt_last_block);
                expect(ann_e).lengthOf(1);
                common.stringifyBN(web3, ann_e[0].args);
                expect(ann_e[0].args).deep.include({
                    '0': masternode1,
                    '1': owner1,
                    '2': ip1.toString(),
                    '3': enode1,
                    '4': toBN(collateral1).toString(),
                    '__length__': 5,
                    'masternode': masternode1,
                    'owner': owner1,
                    'ipv4address': ip1.toString(),
                    'enode': enode1,
                    'collateral': toBN(collateral1).toString(),
                });

                const den_e = await s.orig.getPastEvents('Denounced', common.evt_last_block);
                expect(den_e).lengthOf(0);
            });

            it('should re-announce MN', async () => {
                await s.token_abi.announce(
                    masternode1, ip1, enode1, { from: owner1 });

                const ann_e = await s.orig.getPastEvents('Announced', common.evt_last_block);
                expect(ann_e).lengthOf(1);
                expect(ann_e[0].args).deep.include({
                    '0': masternode1,
                    '1': owner1,
                    '2': ip1,
                    '3': enode1,
                    '4': toBN(collateral1),
                    '__length__': 5,
                    'masternode': masternode1,
                    'owner': owner1,
                    'ipv4address': ip1,
                    'enode': enode1,
                    'collateral': toBN(collateral1),
                });

                const den_e = await s.orig.getPastEvents('Denounced', common.evt_last_block);
                expect(den_e).lengthOf(1);
                expect(den_e[0].args).deep.include({
                    '0': masternode1,
                    '1': owner1,
                    '__length__': 2,
                    'masternode': masternode1,
                    'owner': owner1,
                });

                announced_block = await web3.eth.getBlockNumber();
            });

            it('should refuse announce() another owner\'s MN', async () => {
                try {
                    await s.token_abi.announce(
                        masternode1, ip2, enode2, { from: owner2 });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Invalid owner/);
                }

                expect(await s.orig.getPastEvents('Announced', common.evt_last_block)).lengthOf(0);
            });

            it('should refuse denounce() another owner\'s MN', async () => {
                try {
                    await s.token_abi.denounce(masternode1, { from: owner2 });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Invalid owner/);
                }

                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(0);
            });

            it('should forbid heartbeat() too early', async () => {
                const bn = await web3.eth.getBlockNumber();
                const b = await web3.eth.getBlock(bn);

                try {
                    await s.token_abi.heartbeat(bn, b.hash, '0', {from: masternode1, ...common.zerofee_callopts});
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Too early/);
                }

                await common.moveTime(web3, 59*30);

                try {
                    await s.token_abi.heartbeat(bn, b.hash, '0', {from: masternode1, ...common.zerofee_callopts});
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Too early/);
                }
            });

            it('should be isValid()', async () => {
                expect(await s.token_abi.isValid(masternode1)).true;
                expect(await s.token_abi.isValid(masternode2)).false;
            });

            it('should heartbeat()', async () => {
                await common.moveTime(web3, 60*30+1);

                const s1 = await s.orig.mn_status(masternode1);
                const bn = await web3.eth.getBlockNumber();
                const b = await web3.eth.getBlock(bn);

                await s.token_abi.heartbeat(bn, b.hash, '0', {from: masternode1, ...common.zerofee_callopts});
                
                const s2 = await s.orig.mn_status(masternode1);
                expect(s2.last_heartbeat.gt(s1.last_heartbeat)).true;
                expect(s2.last_heartbeat.gt(b.timestamp)).true;

                const evt = await s.orig.getPastEvents('Heartbeat', common.evt_last_block);
                expect(evt).lengthOf(1);

                expect(evt[0].args).deep.include({
                    '0': masternode1,
                    '__length__': 1,
                    'masternode': masternode1,
                });
            });

            it('should correctly count', async () => {
                const res = await s.token_abi.count();
                assert.equal(res[0], 1);
                assert.equal(res[1], 1);
                assert.equal(res[2].toString(), collateral1.toString());
            });

            it('should produce info()', async () => {
                const info = await s.token_abi.info(masternode1);
                common.stringifyBN(web3, info);
                expect(info).deep.include({
                    owner: owner1,
                    ipv4address: toBN(ip1).toString(),
                    enode: enode1,
                    collateral: toBN(collateral1).toString(),
                });
            });

            it('should produce ownerInfo()', async () => {
                const info = await s.token_abi.ownerInfo(owner1);
                common.stringifyBN(web3, info);
                expect(info).deep.include({
                    masternode: masternode1,
                    ipv4address: toBN(ip1).toString(),
                    enode: enode1,
                    collateral: toBN(collateral1).toString(),
                    announced_block: announced_block.toString(),
                });
            });

            it('should process reward()', async () => {
                const treasury_before = toBN(await web3.eth.getBalance(s.treasury_impl.address));
                const owner_before = toBN(await web3.eth.getBalance(owner1));
                const count = 3;

                for (let i = count; i > 0; --i) {
                    const r = await s.reward_abi.getReward(i);
                    expect(r).eql(reward);
                    await s.reward_abi.reward({
                        from: owner2,
                        value: r
                    });
                }

                const treasury_after = toBN(await web3.eth.getBalance(s.treasury_impl.address));
                expect(treasury_before.toString()).equal(treasury_after.toString());

                const owner_after = toBN(await web3.eth.getBalance(owner1));
                expect(owner_after.sub(owner_before).toString())
                    .eql(reward.mul(toBN(count)).toString());
            });

            it('should handle onCollateralUpdate()', async () => {
                await s.token_abi.onCollateralUpdate(owner1);
                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(0);
            });

            it('should handle enumerate()', async () => {
                expect(await s.token_abi.enumerate()).members([masternode1]);
            });

            it('should forbid heartbeat() too late', async () => {
                const bn = await web3.eth.getBlockNumber();
                const b = await web3.eth.getBlock(bn);

                try {
                    await s.token_abi.heartbeat(bn, b.hash, '0', {from: masternode1, ...common.zerofee_callopts});
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Too early/);
                }

                await common.moveTime(web3, 2*60*60);
                
                try {
                    await s.token_abi.heartbeat(bn, b.hash, '0', {from: masternode1, ...common.zerofee_callopts});
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Too late/);
                }
            });

            it('should denounce() on collateral change', async() => {
                await s.mntoken_abi.depositCollateral({
                    from: owner1,
                    value: collateral1,
                });
                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(1);
                expect(await s.token_abi.enumerate()).members([]);

                await s.token_abi.announce(
                    masternode1, ip1, enode1, { from: owner1 });
                expect(await s.orig.getPastEvents('Announced', common.evt_last_block)).lengthOf(1);
                expect(await s.token_abi.enumerate()).members([masternode1]);

                await s.mntoken_abi.withdrawCollateral(collateral1, {
                    from: owner1,
                });

                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(1);
                expect(await s.token_abi.enumerate()).members([]);

                await s.token_abi.announce(
                    masternode1, ip1, enode1, { from: owner1 });
            });

            it('should denounce()', async()=> {
                await s.token_abi.denounce(masternode1, { from: owner1 });
                const evt = await s.orig.getPastEvents('Denounced', common.evt_last_block);
                expect(evt).lengthOf(1);
                expect(evt[0].args).deep.include({
                    '0': masternode1,
                    '1': owner1,
                    '__length__': 2,
                    'masternode': masternode1,
                    'owner': owner1,
                });
            });
        });

        describe('Two MN', () => {
            const nodes = [
                {
                    masternode: masternode1,
                    ip: ip1,
                    enode: enode1,
                    owner: owner1,
                    collateral: collateral1,
                },
                {
                    masternode: masternode2,
                    ip: ip2,
                    enode: enode2,
                    owner: owner2,
                    collateral: collateral2,
                },
            ];

            it('should announce()', async () => {
                for (let mn of nodes) {
                    await s.token_abi.announce(
                        mn.masternode, mn.ip, mn.enode, { from: mn.owner });
                }

                const mn1_status = await s.orig.mn_status(masternode1);
                const mn2_status = await s.orig.mn_status(masternode2);
                expect(mn1_status.seq_payouts.toString()).equal('3');
                expect(mn2_status.seq_payouts.toString()).equal('2');
            });

            it('should re-announce MN', async () => {
                // back order to test current being left in place first
                for (let mn of Array.from(nodes).reverse()) {
                    await s.token_abi.announce(
                        mn.masternode, mn.ip, mn.enode, { from: mn.owner });

                    const ann_e = await s.orig.getPastEvents('Announced', common.evt_last_block);
                    expect(ann_e).lengthOf(1);
                    common.stringifyBN(web3, ann_e[0].args);
                    expect(ann_e[0].args).deep.include({
                        '0': mn.masternode,
                        '1': mn.owner,
                        '2': toBN(mn.ip).toString(),
                        '3': mn.enode,
                        '4': toBN(mn.collateral).toString(),
                        '__length__': 5,
                        'masternode': mn.masternode,
                        'owner': mn.owner,
                        'ipv4address': toBN(mn.ip).toString(),
                        'enode': mn.enode,
                        'collateral': toBN(mn.collateral).toString(),
                    });

                    const den_e = await s.orig.getPastEvents('Denounced', common.evt_last_block);
                    expect(den_e).lengthOf(1);
                    common.stringifyBN(web3, den_e[0].args);
                    expect(den_e[0].args).deep.include({
                        '0': mn.masternode,
                        '1': mn.owner,
                        '__length__': 2,
                        'masternode': mn.masternode,
                        'owner': mn.owner,
                    });
                }
            });

            it('should refuse announce() another owner\'s MN', async () => {
                try {
                    await s.token_abi.announce(
                        masternode1, ip2, enode2, { from: owner2 });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Invalid owner/);
                }

                expect(await s.orig.getPastEvents('Announced', common.evt_last_block)).lengthOf(0);
            });

            it('should refuse denounce() another owner\'s MN', async () => {
                try {
                    await s.token_abi.denounce(masternode1, { from: owner2 });
                    assert.fail('It should fail');
                } catch (e) {
                    assert.match(e.message, /Invalid owner/);
                }

                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(0);
            });

            it('should be isValid()', async () => {
                for (let mn of nodes) {
                    expect(await s.token_abi.isValid(mn.masternode)).true;
                }
            });

            it('should heartbeat()', async () => {
                await common.moveTime(web3, 60*30+1);

                const s1 = await s.orig.mn_status(masternode1);
                const s1o = await s.orig.mn_status(masternode2);
                const bn = await web3.eth.getBlockNumber();
                const b = await web3.eth.getBlock(bn);

                await s.token_abi.heartbeat(bn, b.hash, '0', {from: masternode1, ...common.zerofee_callopts});
                
                const s2 = await s.orig.mn_status(masternode1);
                expect(s2.last_heartbeat.gt(s1.last_heartbeat)).true;
                expect(s2.last_heartbeat.gt(b.timestamp)).true;

                const s2o = await s.orig.mn_status(masternode2);
                expect(s2o.last_heartbeat.eq(s1o.last_heartbeat)).true;
                
                const evt = await s.orig.getPastEvents('Heartbeat', common.evt_last_block);
                expect(evt).lengthOf(1);

                expect(evt[0].args).deep.include({
                    '0': masternode1,
                    '__length__': 1,
                    'masternode': masternode1,
                });
            });

            it('should correctly count', async () => {
                const res = await s.token_abi.count();
                common.stringifyBN(web3, res);
                expect(res).eql({
                    '0': '2',
                    '1': '2',
                    '2': toWei('50000', 'ether'),
                    '3': toWei('50000', 'ether'),
                    '4': toWei('60000', 'ether'),
                    'active': '2',
                    'total': '2',
                    'active_collateral': toWei('50000', 'ether'),
                    'total_collateral': toWei('50000', 'ether'),
                    'max_of_all_times': toWei('60000', 'ether'),
                });
            });

            it('should produce info()', async () => {
                for (let mn of nodes) {
                    const info = await s.token_abi.info(mn.masternode);
                    common.stringifyBN(web3, info);
                    expect(info).deep.include({
                        owner: mn.owner,
                        ipv4address: toBN(mn.ip).toString(),
                        enode: mn.enode,
                        collateral: toBN(mn.collateral).toString()
                    });
                }
            });

            it('should process reward()', async () => {
                const treasury_before = toBN(await web3.eth.getBalance(s.treasury_impl.address));
                const owner1_before = toBN(await web3.eth.getBalance(owner1));
                const owner2_before = toBN(await web3.eth.getBalance(owner2));
                const count = 10;
                let sb = false;

                for (let i = count; i > 0; --i) {
                    let r = await s.reward_abi.getReward(i);
                    if (r.eq(toBN(0))) {
                        // superblock case
                        r = await s.reward_abi.getReward(i+1);
                        sb = true;
                    }

                    expect(r.toString()).eql(reward.toString());

                    await s.reward_abi.reward({
                        from: owner3,
                        value: r
                    });
                }

                expect(sb).true;

                const treasury_after = toBN(await web3.eth.getBalance(s.treasury_impl.address));
                expect(treasury_before.toString()).equal(treasury_after.toString());

                const owner1_after = toBN(await web3.eth.getBalance(owner1));
                const owner2_after = toBN(await web3.eth.getBalance(owner2));
                expect(owner1_after.sub(owner1_before).toString())
                    .eql(reward.mul(toBN(6)).toString());
                expect(owner2_after.sub(owner2_before).toString())
                    .eql(reward.mul(toBN(4)).toString());
            });

            it('should handle enumerate()', async () => {
                expect(await s.token_abi.enumerate()).members([masternode1, masternode2]);
            });

            it('should denounce() on collateral change', async() => {
                await s.mntoken_abi.depositCollateral({
                    from: owner1,
                    value: collateral1,
                });
                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(1);
                expect(await s.token_abi.enumerate()).members([masternode2]);

                await s.token_abi.announce(
                    masternode1, ip1, enode1, { from: owner1 });
                expect(await s.orig.getPastEvents('Announced', common.evt_last_block)).lengthOf(1);
                expect(await s.token_abi.enumerate()).members([masternode1, masternode2]);

                await s.mntoken_abi.withdrawCollateral(collateral1, {
                    from: owner1,
                });

                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(1);
                expect(await s.token_abi.enumerate()).members([masternode2]);

                await s.token_abi.announce(
                    masternode1, ip1, enode1, { from: owner1 });
            });

            it('should denounce()', async()=> {
                for (let mn of nodes) {
                    await s.token_abi.denounce(mn.masternode, { from: mn.owner });
                    const evt = await s.orig.getPastEvents('Denounced', common.evt_last_block);
                    expect(evt).lengthOf(1);
                    expect(evt[0].args).deep.include({
                        '0': mn.masternode,
                        '1': mn.owner,
                        '__length__': 2,
                        'masternode': mn.masternode,
                        'owner': mn.owner,
                    });
                }
            });
        });

        describe('Three MN', () => {
            const nodes = [
                {
                    masternode: masternode1,
                    ip: ip1,
                    enode: enode1,
                    owner: owner1,
                    collateral: collateral1,
                },
                {
                    masternode: masternode2,
                    ip: ip2,
                    enode: enode2,
                    owner: owner2,
                    collateral: collateral2,
                },
                {
                    masternode: masternode3,
                    ip: ip3,
                    enode: enode3,
                    owner: owner3,
                    collateral: collateral3,
                },
            ];

            it('should announce()', async () => {
                for (let mn of nodes) {
                    await s.token_abi.announce(
                        mn.masternode, mn.ip, mn.enode, { from: mn.owner });
                }

                const mn1_status = await s.orig.mn_status(masternode1);
                const mn2_status = await s.orig.mn_status(masternode2);
                const mn3_status = await s.orig.mn_status(masternode3);
                expect(mn1_status.seq_payouts.toString()).equal('3');
                expect(mn2_status.seq_payouts.toString()).equal('2');
                expect(mn3_status.seq_payouts.toString()).equal('1');
            });

            it('should re-announce MN', async () => {
                // back order to test current being left in place first
                for (let mn of Array.from(nodes).reverse()) {
                    await s.token_abi.announce(
                        mn.masternode, mn.ip, mn.enode, { from: mn.owner });

                    const ann_e = await s.orig.getPastEvents('Announced', common.evt_last_block);
                    expect(ann_e).lengthOf(1);
                    common.stringifyBN(web3, ann_e[0].args);
                    expect(ann_e[0].args).deep.include({
                        '0': mn.masternode,
                        '1': mn.owner,
                        '2': toBN(mn.ip).toString(),
                        '3': mn.enode,
                        '4': toBN(mn.collateral).toString(),
                        '__length__': 5,
                        'masternode': mn.masternode,
                        'owner': mn.owner,
                        'ipv4address': toBN(mn.ip).toString(),
                        'enode': mn.enode,
                        'collateral': toBN(mn.collateral).toString(),
                    });

                    const den_e = await s.orig.getPastEvents('Denounced', common.evt_last_block);
                    expect(den_e).lengthOf(1);
                    common.stringifyBN(web3, den_e[0].args);
                    expect(den_e[0].args).deep.include({
                        '0': mn.masternode,
                        '1': mn.owner,
                        '__length__': 2,
                        'masternode': mn.masternode,
                        'owner': mn.owner,
                    });
                }
            });

            it('should be isValid()', async () => {
                for (let mn of nodes) {
                    expect(await s.token_abi.isValid(mn.masternode)).true;
                    expect(await s.token_abi.isValid(mn.owner)).false;
                }
            });

            it('should correctly count', async () => {
                const res = await s.token_abi.count();
                common.stringifyBN(web3, res);
                expect(res).eql({
                    '0': '3',
                    '1': '3',
                    '2': toWei('60000', 'ether'),
                    '3': toWei('60000', 'ether'),
                    '4': toWei('80000', 'ether'),
                    'active': '3',
                    'total': '3',
                    'active_collateral': toWei('60000', 'ether'),
                    'total_collateral': toWei('60000', 'ether'),
                    'max_of_all_times': toWei('80000', 'ether'),
                });
            });

            it('should produce info()', async () => {
                for (let mn of nodes) {
                    const info = await s.token_abi.info(mn.masternode);
                    common.stringifyBN(web3, info);
                    expect(info).deep.include({
                        owner: mn.owner,
                        ipv4address: toBN(mn.ip).toString(),
                        enode: mn.enode,
                        collateral: toBN(mn.collateral).toString()
                    });
                }
            });

            it('should process reward()', async () => {
                const treasury_before = toBN(await web3.eth.getBalance(s.treasury_impl.address));
                const owner1_before = toBN(await web3.eth.getBalance(owner1));
                const owner2_before = toBN(await web3.eth.getBalance(owner2));
                const owner3_before = toBN(await web3.eth.getBalance(owner3));
                const count = 18;
                let sb = false;
                
                for (let i = count; i > 0; --i) {
                    if (i == 6 || i == 12) {
                        await s.token_abi.validate(masternode2, {from:masternode1, ...common.zerofee_callopts});
                        await s.token_abi.validate(masternode3, {from:masternode1, ...common.zerofee_callopts});
                        await s.token_abi.validate(masternode1, {from:masternode2, ...common.zerofee_callopts});
                        await s.token_abi.validate(masternode3, {from:masternode2, ...common.zerofee_callopts});
                        await s.token_abi.validate(masternode1, {from:masternode3, ...common.zerofee_callopts});
                        await s.token_abi.validate(masternode2, {from:masternode3, ...common.zerofee_callopts});
                    }

                    let r = await s.reward_abi.getReward(i);
                    if (r.eq(toBN(0))) {
                        // superblock case
                        r = await s.reward_abi.getReward(i+1);
                        sb = true;
                    }

                    expect(r.toString()).eql(reward.toString());

                    await s.reward_abi.reward({
                        from: accounts[3],
                        value: r
                    });
                }

                expect(sb).true;

                // The first cycle is paid to Treasury due to lack of votes
                const treasury_after = toBN(await web3.eth.getBalance(s.treasury_impl.address));
                expect(treasury_after.sub(treasury_before).toString())
                    .eql(reward.mul(toBN(6)).toString())

                const owner1_after = toBN(await web3.eth.getBalance(owner1));
                const owner2_after = toBN(await web3.eth.getBalance(owner2));
                const owner3_after = toBN(await web3.eth.getBalance(owner3));
                expect(owner1_after.sub(owner1_before).toString())
                    .eql(reward.mul(toBN(6)).toString());
                expect(owner2_after.sub(owner2_before).toString())
                    .eql(reward.mul(toBN(4)).toString());
                expect(owner3_after.sub(owner3_before).toString())
                    .eql(reward.mul(toBN(2)).toString());
            });

            it('should process reward() no votes & deactivate missing heartbeat', async () => {
                await common.moveTime(web3, 110*60);

                const treasury_before = toBN(await web3.eth.getBalance(s.treasury_impl.address));
                const owner1_before = toBN(await web3.eth.getBalance(owner1));
                const owner2_before = toBN(await web3.eth.getBalance(owner2));
                const owner3_before = toBN(await web3.eth.getBalance(owner3));
                const count = 18;
                let sb = false;

                // Once while active count is above validation barrier
                await s.token_abi.validate(masternode3, {from:masternode1, ...common.zerofee_callopts});
                await s.token_abi.validate(masternode1, {from:masternode2, ...common.zerofee_callopts});
                await s.token_abi.validate(masternode3, {from:masternode2, ...common.zerofee_callopts});
                await s.token_abi.validate(masternode1, {from:masternode3, ...common.zerofee_callopts});

                for (let i = count; i > 0; --i) {
                    if (i == 12 || i == 8 || i == 4) {
                        const bn = await web3.eth.getBlockNumber();
                        const b = await web3.eth.getBlock(bn);
                        await s.token_abi.heartbeat(bn, b.hash, '12', {from:masternode1, ...common.zerofee_callopts});
                        await s.token_abi.heartbeat(bn, b.hash, '34', {from:masternode3, ...common.zerofee_callopts});
                        await common.moveTime(web3, 90*60);
                    }

                    let r = await s.reward_abi.getReward(i);
                    if (r.eq(toBN(0))) {
                        // superblock case
                        r = await s.reward_abi.getReward(i+1);
                        sb = true;
                    }

                    expect(r.toString()).eql(reward.toString());

                    await s.reward_abi.reward({
                        from: accounts[3],
                        value: r,
                    });
                }

                expect(sb).true;

                // The first cycle is paid to Treasury due to lack of votes
                const treasury_after = toBN(await web3.eth.getBalance(s.treasury_impl.address));
                const owner1_after = toBN(await web3.eth.getBalance(owner1));
                const owner2_after = toBN(await web3.eth.getBalance(owner2));
                const owner3_after = toBN(await web3.eth.getBalance(owner3));

                // The treasury must get reward of nodes without votes by design
                expect(treasury_after.sub(treasury_before).toString())
                    .eql(reward.mul(toBN(2+1)).toString())
                expect(owner1_after.sub(owner1_before).toString())
                    .eql(reward.mul(toBN(3+9)).toString());
                expect(owner2_after.sub(owner2_before).toString())
                    .eql(reward.mul(toBN(0+0)).toString());
                expect(owner3_after.sub(owner3_before).toString())
                    .eql(reward.mul(toBN(1+2)).toString());

                expect(await s.token_abi.isValid(masternode1)).true;
                expect(await s.token_abi.isValid(masternode2)).false;
                expect(await s.token_abi.isValid(masternode3)).true;
            });

            it('should refuse validate() inactive node', async () => {
                try {
                    await s.token_abi.validate(masternode2, {from:masternode1, ...common.zerofee_callopts});
                    assert.fail('It must fail');
                } catch (e) {
                    assert.match(e.message, /Not active target/);
                }
            });

            it('should refuse validate() by inactive node', async () => {
                try {
                    await s.token_abi.validate(masternode1, {from:masternode2, ...common.zerofee_callopts});
                    assert.fail('It must fail');
                } catch (e) {
                    assert.match(e.message, /Not active caller/);
                }
            });

            it('should handle enumerate()', async () => {
                expect(await s.token_abi.enumerate()).members([masternode1, masternode2, masternode3]);
            });

            it('should denounce() on collateral change', async() => {
                await s.mntoken_abi.depositCollateral({
                    from: owner1,
                    value: collateral1,
                });
                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(1);
                expect(await s.token_abi.enumerate()).members([masternode2, masternode3]);

                await s.token_abi.announce(
                    masternode1, ip1, enode1, { from: owner1 });
                expect(await s.orig.getPastEvents('Announced', common.evt_last_block)).lengthOf(1);
                expect(await s.token_abi.enumerate()).members([masternode1, masternode2, masternode3]);

                await s.mntoken_abi.withdrawCollateral(collateral1, {
                    from: owner1,
                });

                expect(await s.orig.getPastEvents('Denounced', common.evt_last_block)).lengthOf(1);
                expect(await s.token_abi.enumerate()).members([masternode2, masternode3]);

                await s.token_abi.announce(
                    masternode1, ip1, enode1, { from: owner1 });
            });

            it('should cleanup inactive node', async () => {
                await common.moveTime(web3, 25*60*60);

                for (let i = 4; i > 0; --i) {
                    await s.reward_abi.reward({
                        from: accounts[3],
                        value: reward
                    });
                }

                expect(await s.token_abi.enumerate()).members([masternode1, masternode3]);
            });

            it('should denounce()', async()=> {
                for (let mn of nodes) {
                    await s.token_abi.denounce(mn.masternode, { from: mn.owner });
                    const evt = await s.orig.getPastEvents('Denounced', common.evt_last_block);

                    if (mn.masternode == masternode2) {
                        expect(evt).lengthOf(0);
                        continue;
                    }

                    expect(evt).lengthOf(1);
                    expect(evt[0].args).deep.include({
                        '0': mn.masternode,
                        '1': mn.owner,
                        '__length__': 2,
                        'masternode': mn.masternode,
                        'owner': mn.owner,
                    });
                }
            });

            it('should correctly count() ever max', async () => {
                const res = await s.token_abi.count();
                common.stringifyBN(web3, res);
                expect(res).eql({
                    '0': '0',
                    '1': '0',
                    '2': toWei('0', 'ether'),
                    '3': toWei('0', 'ether'),
                    '4': toWei('90000', 'ether'),
                    'active': '0',
                    'total': '0',
                    'active_collateral': toWei('0', 'ether'),
                    'total_collateral': toWei('0', 'ether'),
                    'max_of_all_times': toWei('90000', 'ether'),
                });
            });
        });

        describe('StorageMasternodeRegistryV1', async () => {
            it ('should refuse setMasternode() from outside', async () => {
                try {
                    await s.storage.setMasternode(
                        masternode1,
                        masternode1,
                        ip1,
                        enode1,
                        '0',
                        '0',
                        masternode1,
                        masternode1
                    );
                    assert.fail('It must fail');
                } catch (e) {
                    assert.match(e.message, /Not owner/);
                }
            });

            it ('should refuse setMasternodePos() from outside', async () => {
                try {
                    await s.storage.setMasternodePos(
                        masternode1,
                        false, masternode1,
                        false, masternode1
                    );
                    assert.fail('It must fail');
                } catch (e) {
                    assert.match(e.message, /Not owner/);
                }
            });

            it ('should refuse deleteMasternode() from outside', async () => {
                try {
                    await s.storage.deleteMasternode(masternode1);
                    assert.fail('It must fail');
                } catch (e) {
                    assert.match(e.message, /Not owner/);
                }
            });
        });
    });

    //---
    describe('common post', () => common.govPostTests(s) );
});
