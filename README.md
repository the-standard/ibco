# Getting Started
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
INFURA_API_KEY=123examp1eap1key123456
```

## Testing
You can run the project's full test suite using Hardhat
```
npx hardhat test
```
Or a specific contract's tests e.g.
```
npx hardhat test test/ibco.js
```

---

# IBCO
Code at [IBCO.sol](https://github.com/the-standard/ibco/blob/master/contracts/IBCO.sol).
Deployed at `0x7dsf78r634hf938u2j394` _(insert the real address when deployed)_ on the Polygon network.

## Read-only functions

### getStatus
```
function getStatus() external view returns (bool _active, uint256 _start, uint256 _stop)
```
Gets current status of IBCO
- `_active`: a boolean indicating whether the IBCO is currently active and swaps are currently permitted
- `_start`: a UNIX epoch timestamp indicating when the IBCO started (default to 0 if not started)
- `_stop`: a UNIX epoch timestamp indicating when the IBCO completed (default to 0 if not completed)

## State-changing functions
### swap
```
function swap(bytes32 _token, uint256 _amount) external ifActive
```
Swaps the given amount of ERC20 token for SEuro, which is minted to `msg.sender`.

Requires `msg.sender` to already have approved allowance of IBCO address.

Requires the given ERC20 token to be an accepted token

Can only be performed if IBCO is active.

- `_token`: the symbol of the token that you'd like to swap for SEuro, represented as 32-byte hex string
  - e.g. `0x5745544800000000000000000000000000000000000000000000000000000000` for `WETH`
- `_amount`: amount of given token that you'd like to swap for SEuro

### swapETH
```
function swapETH() external payable ifActive
```
Swaps the amount of ETH sent in transaction for SEuro, which is minted to `msg.sender`.

Can only be performed if IBCO is active.

### activate
```
function activate() external onlyOwner
```
Sets the IBCO contract `active` flag to true.

Sets the `start` timestamp to the block timestamp.

Can only be performed by IBCO contract owner.

### complete
```
function complete() external onlyOwner
```
Sets the IBCO contract `active` flag to false.

Sets the `stop` timestamp to the block timestamp.

Can only be performed by IBCO contract owner.

---

# Token Manager
Code at [TokenManager.sol](https://github.com/the-standard/ibco/blob/master/contracts/TokenManager.sol).
Deployed at `0x7dsf78r634hf938u2j394` _(insert the real address when deployed)_ on the Polygon network. _(can this be deployed on polygon network)_

## Read-only functions

### getAcceptedTokens
```
function getAcceptedTokens() external view returns (bytes32[] memory)
```
Gets a list of the accepted ERC20 tokens, represented as an array of 32-byte hex strings.

Each 32-byte hex string represents the symbol of an ERC20 token e.g. `0x5745544800000000000000000000000000000000000000000000000000000000` for `WETH`.

### get
```
function get(bytes32 _name) external view returns(address addr, address chainlinkAddr, uint8 chainlinkDec)
```
Gets the details for the given ERC20 token

- `_name`: 32-byte hex string representation of an ERC20 token
  - e.g. `0x5745544800000000000000000000000000000000000000000000000000000000` for `WETH`
- `addr`: address of ERC20 token on Polygon _(um will they all be on polygon net ??)_
- `chainlinkAddr`: address of the Chainlink exchange datafeed for given token -> USD
- `chainlinkDec`: the dec index of the Chainlink exchange datafeed for given token -> USD

## State-changing functions
### addAcceptedToken
```
function addAcceptedToken(bytes32 _name, address _addr, address _chainlinkAddr, uint8 _chainlinkDec) public onlyOwner
```
Adds the given ERC20 token to the Token Manager's list of accepted tokens.

Can only be performed by Token Manager contract owner.

- `_name`: the symbol of the token that you'd like to swap for SEuro, represented as 32-byte hex string
  - e.g. `0x5745544800000000000000000000000000000000000000000000000000000000` for `WETH`
- `_addr`: address of the token contract on the Polygon network _(um ??? ??)_
- `_chainlinkAddr`: address of the Chainlink exchange datafeed for given token -> USD
- `chainlinkDec`: the dec index of the Chainlink exchange datafeed for given token -> USD

### removeAcceptedToken
```
function removeAcceptedToken(bytes32 _name) public onlyOwner
```
Adds the given ERC20 token from the Token Manager's list of accepted tokens.

Can only be performed by Token Manager contract owner.

- `_name`: the symbol of the token that you'd like to swap for SEuro, represented as 32-byte hex string
  - e.g. `0x5745544800000000000000000000000000000000000000000000000000000000` for `WETH`

---

# SEuro Rate Calculator
Code at [SEuroRateCalculator.sol](https://github.com/the-standard/ibco/blob/master/contracts/SEuroRateCalculator.sol).
Deployed at `0x7dsf78r634hf938u2j394` _(insert the real address when deployed)_ on the Polygon network.

## Read-only functions

### calculate
```
function calculate(address _tokUsdCl, uint8 _tokUsdDec) external view returns (uint256 rate)
```
Gets the rate of token -> SEuro for the given token.

The bonding curve discount is included in the rate.

Represented as fractional rate * `FIXED_POINT` e.g. if fractional rate is 0.6, and `FIXED_POINT` is 1,000,000,000,000,000,000, `rate` is 600,000,000,000,000,000

- `_tokUsdCl`: address of the Chainlink exchange datafeed for given token -> USD
- `_tokUsdDec`: the dec index of the Chainlink exchange datafeed for given token -> USD
- `rate`: exchange rate of given token to SEuro
  - represented as fractional rate * `FIXED_POINT`
  - e.g. if rate is 0.6, and calculator `FIXED_POINT` is 1,000,000,000,000,000,000, `rate` = 600,000,000,000,000,000

### FIXED_POINT
```
function FIXED_POINT() external view returns (uint256 FIXED_POINT)
```
Gives the fixed point for fractions in rate

- `FIXED_POINT`: the fixed point used for the fractional rate
  - fractional rate muliplied by `FIXED_POINT` before returned by `calculate`
  - e.g. if `rate` given by `calculate` is 600,000,000,000,000,000, and `FIXED_POINT` is 1,000,000,000,000,000,000, fractional rate is 0.6

---

# Bonding Curve
Code at [BondingCurve.sol](https://github.com/the-standard/ibco/blob/master/contracts/BondingCurve.sol).
Deployed at `0x7dsf78r634hf938u2j394` _(insert the real address when deployed)_ on the Polygon network.

## Read-only functions

### pricePerEuro
```
function pricePerEuro() public view returns (uint256)
```
Gets the current discount rate of SEuro, according to the total supply and the bonding curve

Represented as fractional rate * `FIXED_POINT` e.g. if discount is 0.9, and `FIXED_POINT` is 1,000,000,000,000,000,000, `rate` is 900,000,000,000,000,000

### FIXED_POINT
```
function FIXED_POINT() external view returns (uint256 FIXED_POINT)
```
Gives the fixed point for fractions in rate

- `FIXED_POINT`: the fixed point used for the fractional rate
  - fractional rate muliplied by `FIXED_POINT` before returned by `pricePerEuro`
  - e.g. if discount given by `pricePerEuro` is 900,000,000,000,000,000, and `FIXED_POINT` is 1,000,000,000,000,000,000, fractional discount rate is 0.9
