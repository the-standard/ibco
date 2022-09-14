const { network, ethers } = require('hardhat');
const { getLibraryFactory } = require('../test/common');
const { getDeployedAddresses } = require('./common');

const main = async _ => {
  [ owner ] = await ethers.getSigners();
  const { TOKEN_ADDRESSES, CONTRACT_ADDRESSES } = await getDeployedAddresses(network.name);
  const TST = network.name == 'goerli' ? TOKEN_ADDRESSES.FTST : TOKEN_ADDRESSES.TST;
  const directory = await ethers.getContractAt('StakingDirectory', CONTRACT_ADDRESSES.StakingDirectory);

  if (!await directory.hasRole(await directory.DEFAULT_ADMIN_ROLE(), owner.address)) {
    throw new Error('Signer is not Staking Directory admin');
  }

  const day = 60 * 60 * 24;
  const week = 7 * day;
  const month = 31 * day;
  // -------------------------- update these values! --------------------------
  const start = Math.floor(new Date() / 1000);
  const end = start + week;
  const maturity = end + month;
  const rate = 5000;
  // --------------------------------------------------------------------------

  const stakingContract = await (await getLibraryFactory(owner, 'Staking')).deploy(
    'Staking', 'STS', start, end, maturity, CONTRACT_ADDRESSES.StandardTokenGateway,
    TST, TOKEN_ADDRESSES.SEURO, rate
  );
  await stakingContract.deployed();

  const add = await directory.add(stakingContract.address);
  await add.wait();
  console.log(`Staking contract ${stakingContract.address} added to Directory`);







  const del = await directory.del(stakingContract.address);
  await del.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });