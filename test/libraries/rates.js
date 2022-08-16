const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { expect } = require('chai');

const { getLibraryFactory, etherBalances, CHAINLINK_DEC } = require('../common');

describe('rates', async () => {
  it('does the conversions', async () => {
    const [owner] = await ethers.getSigners();
    const tester = await (await getLibraryFactory(owner, 'RatesLibraryTester')).deploy();
    const amount = etherBalances.ONE_MILLION;

    // rate 1.5
    const rate = 1.5 * 10 ** CHAINLINK_DEC;

    // converts when "asset b" is the given amount
    // should be equal to 1.5x given amount
    let conversion = await tester.testConvertDefault(amount, rate, CHAINLINK_DEC);
    let expectedConversion = amount.add(amount.div(2));
    expect(conversion).to.eq(expectedConversion);

    // converts when "asset a" is the given amount
    // should be equal to 0.6666 of given amount
    conversion = await tester.testConvertInverse(amount, rate, CHAINLINK_DEC);
    expectedConversion = amount.mul(2).div(3);
    expect(conversion).to.eq(expectedConversion);

    // converts with whatever scale you choose
    // 1 in 10 dec = 0.000000001;
    // 1m eth * 0.0000000001 = 10^24 * 10^-10 = 10^14
    conversion = await tester.testConvertDefault(amount, 1, 10);
    expectedConversion = BigNumber.from(10).pow(14);
    expect(conversion).to.eq(expectedConversion);

    // 1m eth / 0.0000000001 = 10^24 / 10^-10 = 10^34
    conversion = await tester.testConvertInverse(amount, 1, 10);
    expectedConversion = BigNumber.from(10).pow(34);
    expect(conversion).to.eq(expectedConversion);
  });
});