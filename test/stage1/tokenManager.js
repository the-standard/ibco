const { ethers } = require('hardhat');
const { expect } = require('chai');
const { DEFAULT_CHAINLINK_ETH_USD_PRICE} = require('../common.js');

describe('TokenManager', async () => {
  const WETH_DEC = 18;
  let TokenManager, owner, user, WETH, DAI, ChainlinkEthUsd, ChainlinkDaiUsd;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const TokenManagerContract = await ethers.getContractFactory('TokenManager');
    WETH = await (await ethers.getContractFactory('MintableERC20')).deploy('Wrapped Ether', 'WETH', WETH_DEC);
    DAI = await (await ethers.getContractFactory('MintableERC20')).deploy('Dai Stablecoin', 'DAI', 18);
    ChainlinkEthUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(DEFAULT_CHAINLINK_ETH_USD_PRICE);
    ChainlinkDaiUsd = await (await ethers.getContractFactory('ChainlinkMock')).deploy(100000000);
    TokenManager = await TokenManagerContract.deploy(WETH.address, ChainlinkEthUsd.address);
  });

  it('gets list of accepted tokens', async () => {
    await TokenManager.connect(owner).addAcceptedToken(DAI.address, ChainlinkDaiUsd.address);
    const acceptedTokens = await TokenManager.getAcceptedTokens();
    expect(acceptedTokens[0]).to.equal("WETH");
    expect(acceptedTokens[1]).to.equal("DAI");
  });

  it('gets token details by name', async () => {
    const acceptedTokens = await TokenManager.getAcceptedTokens();

    let sym = acceptedTokens[0];
    expect(await TokenManager.getTokenAddressFor(sym)).to.equal(WETH.address);
    expect(await TokenManager.getTokenDecimalFor(sym)).to.equal(await WETH.decimals());
    expect(await TokenManager.getChainlinkAddressFor(sym)).to.equal(ChainlinkEthUsd.address);
    expect(await TokenManager.getChainlinkDecimalFor(sym)).to.equal(await ChainlinkEthUsd.decimals());
  });

  it('reverts if requested token does not exist', async () => {
    const get = TokenManager.get("DAI");
    await expect(get).to.be.revertedWith('err-tok-not-found');
  });

  describe('adding tokens', async () => {

    it('allows owner to add new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI.address, ChainlinkDaiUsd.address);
      const acceptedTokens = await TokenManager.getAcceptedTokens();

      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens[1]).to.equal("DAI");

      const addDuplicate = TokenManager.connect(owner).addAcceptedToken(DAI.address, ChainlinkDaiUsd.address);
      await expect(addDuplicate).to.be.revertedWith('err-token-exists');
    });

    it('does not allow non-owner to add token', async () => {
      const addAcceptedToken = TokenManager.connect(user).addAcceptedToken(DAI.address, ChainlinkDaiUsd.address);
      await expect(addAcceptedToken).to.be.revertedWith('Ownable: caller is not the owner');

      const acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
    });
  });

  describe('removing tokens', async () => {

    it('allows owner to remove new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI.address, ChainlinkDaiUsd.address);
      let acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens[1]).to.equal("DAI");

      await TokenManager.connect(owner).removeAcceptedToken("DAI");
      acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens.length).to.equal(1);
    });

    it('does not allow non-owner to remove token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI.address, ChainlinkDaiUsd.address);
      let acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens[1]).to.equal("DAI");
      expect(await TokenManager.getChainlinkAddressFor("DAI")).to.equal(ChainlinkDaiUsd.address);
      expect(await TokenManager.getTokenAddressFor("DAI")).to.equal(DAI.address);

      const removeToken = TokenManager.connect(user).removeAcceptedToken("DAI");
      await expect(removeToken).to.be.revertedWith('Ownable: caller is not the owner');
      acceptedTokens = await TokenManager.getAcceptedTokens();
      expect(acceptedTokens[0]).to.equal("WETH");
      expect(acceptedTokens[1]).to.equal("DAI");
    });
  });
});
