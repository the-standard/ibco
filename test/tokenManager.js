const { ethers } = require('hardhat');
const { expect } = require('chai');
const { WETH_ADDRESS, DAI_ADDRESS, CHAINLINK_ETH_USD, CHAINLINK_DEC, CHAINLINK_DAI_USD } = require('./common');

describe('TokenManager', async () => {
  const WETH_BYTES = ethers.utils.formatBytes32String('WETH');
  const WETH_DEC = 18;
  const DAI = ethers.utils.formatBytes32String('DAI');
  const DAI_DEC = 18;
  let TokenManager, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const TokenManagerContract = await ethers.getContractFactory('TokenManager');
    TokenManager = await TokenManagerContract.deploy(WETH_ADDRESS, CHAINLINK_ETH_USD, CHAINLINK_DEC);
  });

  it('gets list of accepted tokens', async () => {
    await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
    const acceptedTokens = await TokenManager.getAcceptedTokens();

    const tokens = [WETH_BYTES, DAI];
    expect(acceptedTokens).to.eql(tokens);
  });

  it('gets token details by name', async () => {
    const acceptedTokens = await TokenManager.get(WETH_BYTES);

    expect(acceptedTokens.addr).to.equal(WETH_ADDRESS);
    expect(acceptedTokens.dec).to.equal(WETH_DEC);
    expect(acceptedTokens.chainlinkAddr).to.equal(CHAINLINK_ETH_USD);
    expect(acceptedTokens.chainlinkDec).to.equal(CHAINLINK_DEC);
  });

  describe('adding tokens', async () => {

    it('allows owner to add new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      const acceptedTokens = await TokenManager.getAcceptedTokens();

      const tokens = [WETH_BYTES, DAI];
      expect(acceptedTokens).to.eql(tokens);
    });

    it('does not allow non-owner to add token', async () => {
      const addAcceptedToken = TokenManager.connect(user).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      await expect(addAcceptedToken).to.be.revertedWith('Ownable: caller is not the owner');

      const acceptedTokens = await TokenManager.getAcceptedTokens();
      const tokens = [WETH_BYTES];
      expect(acceptedTokens).to.eql(tokens);
    });
  });

  describe('removing tokens', async () => {

    it('allows owner to remove new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES, DAI]);

      await TokenManager.connect(owner).removeAcceptedToken(DAI);
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES]);
    });

    it('does not allow non-owner to remove token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES, DAI]);

      const removeToken = TokenManager.connect(user).removeAcceptedToken(DAI);
      await expect(removeToken).to.be.revertedWith('Ownable: caller is not the owner');
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES, DAI]);
    });
  });
});
