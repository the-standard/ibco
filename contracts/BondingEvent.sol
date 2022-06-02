//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BondingEvent is AccessControl {
	// sEUR: the main leg of the currency pair
	address public immutable standardEuroToken;
	// other legs which has to be erc20 comptabile
	address[] public erc20Tokens;
	// allow quick lookup to see if token is in whitelist instead of iterating over array
	mapping(address => bool) private whitelistedTokens;
	// liquidity pool for a currency pair (sEURO : someToken)
	address[] public liquidityPools;
	// minimum currency amount
	uint256 public immutable MIN_VAL = 0;

	// uniswap: creates bond
	INonfungiblePositionManager private immutable manager;
	// https://docs.uniswap.org/protocol/reference/core/libraries/Tick
	int24 public tickSpacing;
	int24 private constant TICK_LOWER = -887270;
	int24 private constant TICK_UPPER = 887270;
	uint24 private fee; // should the fee really be private?

	// store array of liquidity token IDs (received after successful bond)
	uint256[] private positionIDs;

	// only contract owner can add and remove tokens from the white list `erc20Tokens`
	bytes32 public constant WHITELIST_GUARD = keccak256("WHITELIST_GUARD");

	constructor(address _sEuro, address _manager) {
		_setupRole(WHITELIST_GUARD, msg.sender);
		standardEuroToken = _sEuro;
		manager = INonfungiblePositionManager(_manager);
	}

	// Adds a new ERC20-token to the list of allowed currency legs
	function appendErc20compatible(address _token) private {
		require(hasRole(WHITELIST_GUARD, msg.sender), 'invalid-whitelist-guard');
		require(whitelistedTokens[_token] == false, 'token-already-added');

		erc20Tokens.push(_token);
		whitelistedTokens[_token] = true;
	}


	// Compares a token `_otherToken` to the Standard Euro token and returns them in ascending order
	function getAscendingPair(address _otherToken) private view returns (address token0, address token1) {
		(token0, token1) = standardEuroToken < _otherToken
			? (standardEuroToken, _otherToken)
			: (_otherToken, standardEuroToken);
	}

	// Returns the amount of currency pairs on-ramped
	function amountCurrencyPairs() external view returns (uint256) {
		return liquidityPools.length;
	}

	/// @notice Parameter `_price` is in sqrtPriceX96 format
	function initialisePool(address _otherToken, uint160 _price, uint24 _fee) external {
		appendErc20compatible(_otherToken);
		(address token0, address token1) = getAscendingPair(_otherToken);
		fee = _fee;
		address pool = manager.createAndInitializePoolIfNecessary(
			token0,
			token1,
			_fee,
			_price
		);
		tickSpacing = IUniswapV3Pool(pool).tickSpacing();
		liquidityPools.push(pool);
	}

	function validTicks() private view returns (bool) {
		return TICK_LOWER % tickSpacing == 0 && TICK_UPPER % tickSpacing == 0;
	}

	function bond(uint256 _amountSeuro, address _otherToken, uint256 _amountOther) public {
		require(whitelistedTokens[_otherToken] == true, 'invalid-token-bond');

		TransferHelper.safeTransferFrom(standardEuroToken, msg.sender, address(this), _amountSeuro);
		TransferHelper.safeTransferFrom(_otherToken, msg.sender, address(this), _amountOther);
		TransferHelper.safeApprove(standardEuroToken, address(manager), _amountSeuro);
		TransferHelper.safeApprove(_otherToken, address(manager), _amountOther);

		(address token0, address token1) = getAscendingPair(_otherToken);
		// not sure why the full amount of seuro can't be added
		uint256 minSeuro = _amountSeuro - 1 ether;
		(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) =
			token0 == standardEuroToken ?
			(_amountSeuro, _amountOther, minSeuro, MIN_VAL) :
			(_amountOther, _amountSeuro, MIN_VAL, minSeuro);

		require(validTicks(), 'err-inv-tick');

		INonfungiblePositionManager.MintParams memory params =
			INonfungiblePositionManager.MintParams({
			token0: token0,
			token1: token1,
			fee: fee,
			tickLower: TICK_LOWER,
			tickUpper: TICK_UPPER,
			amount0Desired: amount0Desired,
			amount1Desired: amount1Desired,
			amount0Min: amount0Min,
			amount1Min: amount1Min,
			recipient: address(this),
			deadline: block.timestamp
		});

		(uint256 tokenID, /* liquidity */ , uint256 amount0, uint256 amount1) = manager.mint(params);
		positionIDs.push(tokenID);

		TransferHelper.safeApprove(standardEuroToken, address(manager), 0);
		TransferHelper.safeApprove(_otherToken, address(manager), 0);

		uint256 refund = token0 == _otherToken ?
			_amountOther - amount0 :
			_amountOther - amount1;

		TransferHelper.safeTransfer(_otherToken, msg.sender, refund);
	}
}
