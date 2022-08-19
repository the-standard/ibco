const { ethers } = require('hardhat');
const { expect } = require('chai');
const { WETH_ADDRESS, DAI_ADDRESS, CHAINLINK_ETH_USD, CHAINLINK_DEC, CHAINLINK_DAI_USD} = require('../common.js');

describe('TokenManager', async () => {
  const WETH_DEC = 18;
  const WETH_TOKEN = [ WETH_ADDRESS, 18, CHAINLINK_ETH_USD, CHAINLINK_DEC];
  const DAI_TOKEN = [ DAI_ADDRESS, 18, CHAINLINK_DAI_USD, CHAINLINK_DEC];

  let TokenManager, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const TokenManagerContract = await ethers.getContractFactory('TokenManager');
    TokenManager = await TokenManagerContract.deploy(WETH_ADDRESS, CHAINLINK_ETH_USD, CHAINLINK_DEC);
  });

  it('gets list of accepted tokens', async () => {
    await TokenManager.connect(owner).addAcceptedToken(DAI_ADDRESS, CHAINLINK_DAI_USD, CHAINLINK_DEC);
    const acceptedTokens = await TokenManager.getAcceptedTokens();
    expect(acceptedTokens[0]).to.equal("WETH");
    expect(acceptedTokens[1]).to.equal("DAI");
  });

  it('gets token details by name', async () => {
    const acceptedTokens = await TokenManager.getAcceptedTokens();

    let sym = acceptedTokens[0];
    expect(await TokenManager.getTokenAddressFor(sym)).to.equal(WETH_ADDRESS);
    expect(await TokenManager.getTokenDecimalFor(sym)).to.equal(WETH_DEC);
    expect(await TokenManager.getChainlinkAddressFor(sym)).to.equal(CHAINLINK_ETH_USD);
    expect(await TokenManager.getChainlinkDecimalFor(sym)).to.equal(CHAINLINK_DEC);
  });

  it('reverts if requested token does not exist', async () => {
    const get = TokenManager.get("DAI");
    await expect(get).to.be.revertedWith('err-tok-not-found');
  });

  describe('adding tokens', async () => {

    it('allows owner to add new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI_ADDRESS, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      const acceptedTokens = await TokenManager.getAcceptedTokens();

      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens[1]).to.equal("DAI");
    });

    it('does not allow non-owner to add token', async () => {
      const addAcceptedToken = TokenManager.connect(user).addAcceptedToken(DAI_ADDRESS, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      await expect(addAcceptedToken).to.be.revertedWith('Ownable: caller is not the owner');

      const acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
    });
  });

  describe('removing tokens', async () => {

    it('allows owner to remove new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI_ADDRESS, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      let acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens[1]).to.equal("DAI");

      await TokenManager.connect(owner).removeAcceptedToken("DAI");
      acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens.length).to.equal(1);
    });

    it('does not allow non-owner to remove token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI_ADDRESS, CHAINLINK_DAI_USD, CHAINLINK_DEC);
      let acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens[1]).to.equal("DAI");
      expect(await TokenManager.getChainlinkAddressFor("DAI")).to.equal(CHAINLINK_DAI_USD);
      expect(await TokenManager.getTokenAddressFor("DAI")).to.equal(DAI_ADDRESS);

      const removeToken = TokenManager.connect(user).removeAcceptedToken("DAI");
      await expect(removeToken).to.be.revertedWith('Ownable: caller is not the owner');
      acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens[1]).to.equal("DAI");
    });
  });
});
