const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('TokenManager', async () => {
  const WETH_BYTES = ethers.utils.formatBytes32String('WETH');
  const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const WETH_DEC = 18;
  const WETH_USD_CL = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
  const WETH_CL_DEC = 8;
  const DAI = ethers.utils.formatBytes32String('DAI');
  const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const DAI_DEC = 18;
  const DAI_USD_CL = '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9';
  const DAI_CL_DEC = 8;
  let TokenManager, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const TokenManagerContract = await ethers.getContractFactory('TokenManager');
    TokenManager = await TokenManagerContract.deploy(WETH_ADDRESS, WETH_DEC, WETH_USD_CL, WETH_CL_DEC);
  });

  it('gets list of accepted tokens', async () => {
    await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, DAI_USD_CL, DAI_CL_DEC);
    const acceptedTokens = await TokenManager.getAcceptedTokens();

    const tokens = [WETH_BYTES, DAI];
    expect(acceptedTokens).to.eql(tokens);
  });

  it('gets token details by name', async () => {
    const acceptedTokens = await TokenManager.get(WETH_BYTES);

    expect(acceptedTokens.addr).to.equal(WETH_ADDRESS);
    expect(acceptedTokens.dec).to.equal(WETH_DEC);
    expect(acceptedTokens.chainlinkAddr).to.equal(WETH_USD_CL);
    expect(acceptedTokens.chainlinkDec).to.equal(WETH_CL_DEC);
  });

  describe('adding tokens', async () => {
    const DAI_CL_DEC = 8;

    it('allows owner to add new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, DAI_USD_CL, DAI_CL_DEC);
      const acceptedTokens = await TokenManager.getAcceptedTokens();

      const tokens = [WETH_BYTES, DAI];
      expect(acceptedTokens).to.eql(tokens);
    });

    it('does not allow non-owner to add token', async () => {
      const addAcceptedToken = TokenManager.connect(user).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, DAI_USD_CL, DAI_CL_DEC);
      await expect(addAcceptedToken).to.be.revertedWith('Ownable: caller is not the owner');

      const acceptedTokens = await TokenManager.getAcceptedTokens();
      const tokens = [WETH_BYTES];
      expect(acceptedTokens).to.eql(tokens);
    });
  });

  describe('removing tokens', async () => {

    it('allows owner to remove new token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, DAI_USD_CL, DAI_CL_DEC);
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES, DAI]);

      await TokenManager.connect(owner).removeAcceptedToken(DAI);
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES]);
    });

    it('does not allow non-owner to remove token', async () => {
      await TokenManager.connect(owner).addAcceptedToken(DAI, DAI_ADDRESS, DAI_DEC, DAI_USD_CL, DAI_CL_DEC);
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES, DAI]);

      const removeToken = TokenManager.connect(user).removeAcceptedToken(DAI);
      await expect(removeToken).to.be.revertedWith('Ownable: caller is not the owner');
      expect(await TokenManager.getAcceptedTokens()).to.eql([WETH_BYTES, DAI]);
    });
  });
});
