const { expect } = require('chai');
const { ethers } = require('hardhat');
const { CHAINLINK_DEC, getLibraryFactory, etherBalances, parse6Dec, helperFastForwardTime, CHAINLINK_EUR_USD } = require('../common.js');

describe('BondStorage', async () => {
  const deployAndMintGateway = async () => {
    const TST = await erc20Contract.deploy('The Standard Token', 'TST', 18);
    gateway = await (await ethers.getContractFactory('StandardTokenGateway')).deploy(TST.address);
    await TST.mint(gateway.address, etherBalances.ONE_BILLION);
    await gateway.updateRewardSupply();
  }

  let contractFactory, BondStorage, owner, customer, gateway, gateway2, Seuro, Other, erc20Contract;
  beforeEach(async () => {
    [owner, customer, gateway2, user1, user2] = await ethers.getSigners();
    contractFactory = await getLibraryFactory(owner, 'BondStorage');
    erc20Contract = await ethers.getContractFactory('DUMMY');
    Seuro = await erc20Contract.deploy('sEURO', 'SEUR', 18);
    Other = await erc20Contract.deploy('USD Coin', 'USDC', 6);
    await deployAndMintGateway();
    BondStorage = await contractFactory.deploy(gateway.address, CHAINLINK_EUR_USD, CHAINLINK_DEC, Seuro.address, Other.address);
    await gateway.setStorageAddress(BondStorage.address);
  });

  describe('dependencies', async () => {
    it('allows owner to update token gateway dependency', async () => {
      let update = BondStorage.connect(customer).setTokenGateway(gateway2.address);
      await expect(update).to.be.revertedWith('invalid-storage-operator');
      expect(await BondStorage.tokenGateway()).to.equal(gateway.address);

      update = BondStorage.connect(owner).setTokenGateway(gateway2.address);
      await expect(update).not.to.be.reverted;
      expect(await BondStorage.tokenGateway()).to.equal(gateway2.address);
    });
  });

  describe('catastrophe', async () => {
    let amountSeuro, amountOther;

    const startBonds = async () => {
      // start some bonds for two users
      // two bonds not mature, one mature but not claimed, one claimed
      // catastrophe should therefore only be active for three
      amountSeuro = etherBalances['10K'];
      amountOther = parse6Dec(5000);
      const rate = 1000;
      const day = 60 * 60 * 24;
      const week = 7 * day;
      // doesn't matter here:
      const tokenId = 1; const liquidity = 100
      await BondStorage.startBond(user1.address, amountSeuro, amountOther, rate, day, tokenId, liquidity);
      await BondStorage.startBond(user2.address, amountSeuro, amountOther, rate, day, tokenId, liquidity);
      await BondStorage.startBond(user1.address, amountSeuro, amountOther, rate, week, tokenId, liquidity);
      await BondStorage.startBond(user2.address, amountSeuro, amountOther, rate, week, tokenId, liquidity);
      await helperFastForwardTime(2 * day);
      await BondStorage.claimReward(user1.address);
    }

    beforeEach(async () => {
      await startBonds();
    });

    it('calculates required seuro / other in contract', async () => {
      const expectedRequiredSeuro = amountSeuro.mul(3); // three live bonds
      const expectedRequiredOther = amountOther.mul(3); // three live bonds

      const { seuroRequired, otherRequired } = await BondStorage.catastropheFundsRequired();

      expect(seuroRequired).to.eq(expectedRequiredSeuro);
      expect(otherRequired).to.eq(expectedRequiredOther);
    });

    it('only enable catastrophe mode if: admin user, enough balance, not already catastrophe mode', async () => {
      expect(await BondStorage.isCatastrophe()).to.eq(false);
      const { seuroRequired, otherRequired } = await BondStorage.catastropheFundsRequired();

      let catastrophe = BondStorage.enableCatastropheMode();
      await expect(catastrophe).to.be.revertedWith('err-insuff-bal');

      await Seuro.mint(BondStorage.address, seuroRequired);
      await Other.mint(BondStorage.address, otherRequired);

      catastrophe = BondStorage.connect(user1).enableCatastropheMode();
      await expect(catastrophe).to.be.revertedWith('invalid-storage-operator');

      catastrophe = BondStorage.enableCatastropheMode();
      await expect(catastrophe).not.to.be.reverted;
      expect(await BondStorage.isCatastrophe()).to.eq(true);

      catastrophe = BondStorage.enableCatastropheMode();
      await expect(catastrophe).to.be.revertedWith('err-catastrophe');

      catastrophe = BondStorage.connect(user1).disableCatastropheMode();
      await expect(catastrophe).to.be.revertedWith('invalid-storage-operator');

      catastrophe = BondStorage.disableCatastropheMode();
      await expect(catastrophe).not.to.be.reverted;
      expect(await BondStorage.isCatastrophe()).to.eq(false);
    });
  });
});
