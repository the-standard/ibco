const { ethers } = require('hardhat');
const { expect } = require('chai');
const { WETH_ADDRESS, DAI_ADDRESS, CHAINLINK_ETH_USD, CHAINLINK_DEC, CHAINLINK_DAI_USD } = require('./common');

describe('TokenManager', async () => {
  const WETH_BYTES = ethers.utils.formatBytes32String('WETH');
  const WETH_DEC = 18;
  const DAI_BYTES = ethers.utils.formatBytes32String('DAI');
  const DAI_DEC = 18;
  const WETH_TOKEN = [WETH_BYTES, WETH_ADDRESS, 18, CHAINLINK_ETH_USD, CHAINLINK_DEC];
  const DAI_TOKEN = [DAI_BYTES, DAI_ADDRESS, 18, CHAINLINK_DAI_USD, CHAINLINK_DEC];

  let TokenManager, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const TokenManagerContract = await ethers.getContractFactory('TokenManager');
    TokenManager = await TokenManagerContract.deploy(WETH_ADDRESS, CHAINLINK_ETH_USD, CHAINLINK_DEC);
  });

  it('gets list of accepted tokens', async () => {
    await TokenManager.connect(owner).addAcceptedToken(DAI_BYTES, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
    const acceptedTokens = await TokenManager.getAcceptedTokens();
    const tokens = [WETH_TOKEN, DAI_TOKEN];
    expect(acceptedTokens).to.eql(tokens);
  });

  it('gets token details by name', async () => {
    const acceptedTokens = await TokenManager.get(WETH_BYTES);

    expect(acceptedTokens.addr).to.equal(WETH_ADDRESS);
    expect(acceptedTokens.dec).to.equal(WETH_DEC);
    expect(acceptedTokens.chainlinkAddr).to.equal(CHAINLINK_ETH_USD);
    expect(acceptedTokens.chainlinkDec).to.equal(CHAINLINK_DEC);
  });

  it('reverts if requested token does not exist', async () => {
    const get = TokenManager.get(DAI_BYTES);
    await expect(get).to.be.revertedWith('err-tok-not-found');
  });

  describe('adding tokens', async () => {

    it('allows owner to add new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI_BYTES, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      const acceptedTokens = await TokenManager.getAcceptedTokens();

      const tokens = [WETH_TOKEN, DAI_TOKEN];
      expect(acceptedTokens).to.eql(tokens);
    });

    it('does not allow non-owner to add token', async () => {
      const addAcceptedToken = TokenManager.connect(user).addAcceptedToken(DAI_BYTES, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      await expect(addAcceptedToken).to.be.revertedWith('Ownable: caller is not the owner');

      const acceptedTokens = await TokenManager.getAcceptedTokens();
      const tokens = [WETH_TOKEN];
      expect(acceptedTokens).to.eql(tokens);
    });
  });

  describe('removing tokens', async () => {

    it('allows owner to remove new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI_BYTES, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_TOKEN, DAI_TOKEN]);

      await TokenManager.connect(owner).removeAcceptedToken(DAI_BYTES);
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_TOKEN]);
    });

    it('does not allow non-owner to remove token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI_BYTES, DAI_ADDRESS, DAI_DEC, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_TOKEN, DAI_TOKEN]);

      const removeToken = TokenManager.connect(user).removeAcceptedToken(DAI_BYTES);
      await expect(removeToken).to.be.revertedWith('Ownable: caller is not the owner');
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_TOKEN, DAI_TOKEN]);
    });
  });
});
