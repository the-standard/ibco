const { ethers } = require('hardhat');
const { expect } = require('chai');
const bn = require('bignumber.js');

let owner, customer, SEuro, TST;

let OWNER_ADDR, CUSTOMER_ADDR;

let durations = {
  "ONE_YR_WEEKS": 52,
  "HALF_YR_WEEKS": 26,
  "ONE_WEEK": 1,
  "TWO_WEEKS": 2,
  "FOUR_WEEKS": 4,
  "EIGHT_WEEKS": 8
};

beforeEach(async () => {
  [owner, customer] = await ethers.getSigners();
  const SEuroContract = await ethers.getContractFactory('SEuro');
  const ERC20Contract = await ethers.getContractFactory('DUMMY');
  SEuro = await SEuroContract.deploy('sEURO', 'SEUR', [owner.address]);
  TST = await ERC20Contract.deploy('TST', 'TST', ethers.utils.parseEther('10000000'));
  TST_ADDRESS = TST.address;
  SEUR_ADDRESS = SEuro.address;
  CUSTOMER_ADDR = customer.address;
  OWNER_ADDR = owner.address;
});

describe('Staking', async () => {
}
