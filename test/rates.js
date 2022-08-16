const { ethers } = require('hardhat');
const { expect } = require('chai');

const { getLibraryFactory, etherBalances, CHAINLINK_DEC } = require('./common');

describe('rate', async () => {
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
  });
});