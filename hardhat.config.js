require("@nomiclabs/hardhat-waffle");
require('dotenv').config();

const { MATIC_API_KEY } = process.env;

module.exports = {
  defaultNetwork: 'hardhat',
  solidity: "0.8.10",
  networks: {
    hardhat: {
      forking: {
        url: `https://rpc-mainnet.maticvigil.com/v1/${MATIC_API_KEY}`
      }
    },
    matic: {
      url: `https://rpc-mainnet.maticvigil.com/v1/${MATIC_API_KEY}`,
    }
  }
};
