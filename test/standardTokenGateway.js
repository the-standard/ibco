const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');
const { CHAINLINK_DEC, etherBalances } = require('./common');

describe('StandardTokenGateway', async () => {
  let StandardTokenGateway;
  // $1.05
  const eurUsdPrice = 105000000;

  beforeEach(async () => {
    const ChainlinkMock = await (await ethers.getContractFactory('Chainlink')).deploy(eurUsdPrice);
    const TST = await (await ethers.getContractFactory('DUMMY')).deploy('Standard Token', 'TST', 18);
    const SEuro = await (await ethers.getContractFactory('DUMMY')).deploy('SEuro', 'SEUR', 18);
    StandardTokenGateway = await (await ethers.getContractFactory('StandardTokenGateway')).deploy(
      TST.address, SEuro.address, ChainlinkMock.address, CHAINLINK_DEC
    );
  });

  const otherAmountToTst = amount => {
    const chainlinkDecScale = BigNumber.from(10).pow(CHAINLINK_DEC);
    // divides by eur / usd to convert to euro amount, multiplies by chainlink dec scale to cancel out division by eurUsdPrice price
    return amount.mul(chainlinkDecScale).div(eurUsdPrice);
  };

  it('provides the TST exchange for sEURO and the other asset', async () => {
    const TSTPrice = await StandardTokenGateway.tokenPrice();
    const amount = etherBalances['10K'];
    let expectedTST = amount.mul(TSTPrice);
    expect(await StandardTokenGateway.seuroToStandardToken(amount)).to.equal(expectedTST);

    expectedTST = otherAmountToTst(amount);
    expectedTST = otherToEur(amount).mul(TSTPrice);
    expect(await StandardTokenGateway.otherToStandardToken(amount)).to.equal(expectedTST);
  });
});
