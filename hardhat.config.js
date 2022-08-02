require("@nomiclabs/hardhat-waffle");
require('dotenv').config();
require('solidity-coverage')
require('hardhat-contract-sizer');

const { INFURA_API_KEY, TEST_ACCOUNT_PRIVATE_KEY } = process.env;

let testAccounts = TEST_ACCOUNT_PRIVATE_KEY ? [TEST_ACCOUNT_PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.14",
        settings: {
          optimizer: {
            enabled: true
          },
        },
      },
      {
        version: "0.7.6",
      }
    ]
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      forking: {
        url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      },
      chainId: 31337
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_API_KEY}`,
      accounts: testAccounts
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
      accounts: testAccounts
    }
  },
  contractSizer: {
    alphaSort: false,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: true,
    only: [],
  }
};
