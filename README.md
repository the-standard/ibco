# The Standard: Initial Bond Curve Offering

![Main CI](https://github.com/the-standard/ibco/actions/workflows/.github/workflows/main.yml/badge.svg?branch=master)

## Installation
If you have npm installed, you can install the required project dependencies
```
npm install
```

## Mainnet fork setup
The IBCO tests are run against a forked version of the Ethereum mainnet. You will need an Infura API key to run these tests.
- Create a file `.env` in the root of the IBCO project.
- Sign up to [Infura](https://infura.io/)
- Create a new project in Infura
- Select Ethereum as the product type
- In your new Infura project's settings, locate the Project ID
- Copy Project ID to your new `.env` file as the `INFURA_API_KEY` value:
```
INFURA_API_KEY=<hexadecimal characters>
```

## Testing
If you are in root, you can run the project's full test suite using the Makefile by
```
make test
```
Or all the tests in one of the three stages by:
```
make testStage2
```
Since this project uses Hardhat, you can use its default ways to run tests, should you prefer it.
## Coverage
Run the code coverage suite with
```
make cov
```

## Contract size benchmark
Run the contract sizer with
```
make size
```

## Technical Documentation
- [Stage 1](docs/stage-1)
- [Stage 2](docs/stage-2)
- [Deployment](docs/deployment)
