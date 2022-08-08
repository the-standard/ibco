const { ethers } = require('hardhat');
const { expect } = require('chai');
const { CHAINLINK_DEC, etherBalances, DEFAULT_CHAINLINK_EUR_USD_PRICE, defaultConvertUsdToEur } = require('./common');

describe('StandardTokenGateway', async () => {
  let StandardTokenGateway;
  // $1.05
  const eurUsdPrice = DEFAULT_CHAINLINK_EUR_USD_PRICE;

  beforeEach(async () => {
    const ChainlinkMock = await (await ethers.getContractFactory('Chainlink')).deploy(eurUsdPrice);
    const TST = await (await ethers.getContractFactory('DUMMY')).deploy('Standard Token', 'TST', 18);
    const SEuro = await (await ethers.getContractFactory('DUMMY')).deploy('SEuro', 'SEUR', 18);
    StandardTokenGateway = await (await ethers.getContractFactory('StandardTokenGateway')).deploy(
      TST.address, SEuro.address, ChainlinkMock.address, CHAINLINK_DEC
    );
  });

  it('provides the TST exchange for sEURO and the other asset', async () => {
    const TSTPrice = await StandardTokenGateway.tokenPrice();
    const amount = etherBalances['10K'];
    let expectedTST = amount.mul(TSTPrice);
    expect(await StandardTokenGateway.seuroToStandardToken(amount)).to.equal(expectedTST);

    expectedTST = defaultConvertUsdToEur(amount).mul(TSTPrice);
    expect(await StandardTokenGateway.otherToStandardToken(amount)).to.equal(expectedTST);
  });
});
