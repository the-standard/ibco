require("@nomiclabs/hardhat-waffle");
require('dotenv').config();

const { INFURA_API_KEY } = process.env;

module.exports = {
  defaultNetwork: 'hardhat',
  solidity: "0.8.10",
  // networks: {
  //   hardhat: {
  //     forking: {
  //       url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
  //     },
  //   }
  // },
};
