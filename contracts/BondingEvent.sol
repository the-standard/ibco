//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "contracts/BondStorage.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract BondingEvent is AccessControl, BondStorage {
	// sEUR: the main leg of the currency pair
	address public immutable sEuroToken;
	// other: the other ERC-20 token
	address public immutable otherToken;
	// bond storage contract
	address public bondStorage;

	bool private init;

	INonfungiblePositionManager private immutable manager;

	// https://docs.uniswap.org/protocol/reference/core/libraries/Tick
	int24 public tickLowerBound;
	int24 public tickHigherBound;
	uint24 fee;

	// Emitted when a user adds liquidity.
	event mintPosition(address user, uint256 nft, uint128 liquidity, uint256 amount0, uint256 amount1);

	// only contract owner can add the other currency leg
	bytes32 public constant WHITELIST_BONDING_EVENT = keccak256("WHITELIST_BONDING_EVENT");

	constructor(address _sEuro, address _otherToken, address _manager, address _bondStorage) {
		_setupRole(WHITELIST_BONDING_EVENT, msg.sender);
		sEuroToken = _sEuro;
		otherToken = _otherToken;
		bondStorage = _bondStorage;
		tickLowerBound = -10000;
		tickHigherBound = 10000;
		manager = INonfungiblePositionManager(_manager);
	}

	modifier onlyPoolOwner {
		_onlyPoolOwner();
		_;
	}

	function _onlyPoolOwner() private view {
		require(hasRole(WHITELIST_BONDING_EVENT, msg.sender), "invalid-user");
	}

	modifier isNotInit {
		_isNotInit();
		_;
	}

	function _isNotInit() private view {
		require(init == false, "token-already-init");
	}

	modifier isInit {
		_isInit();
		_;
	}

	function _isInit() private view {
		require(init == true, "token-not-init");
	}

	function adjustTick(int24 newLower, int24 newHigher) public {
		_validTicks(newLower, newHigher);
		tickLowerBound = newLower;
		tickHigherBound = newHigher;
	}

	function _validTicks(int24 newLower, int24 newHigher) private view onlyPoolOwner isInit {
		int24 tickSpacing = 10;
		require(newLower % tickSpacing == 0 && newHigher % tickSpacing == 0, "tick-mod-spacing-nonzero");
		require(newHigher <= 887270, "tick-max-exceeded");
		require(newLower >= -887270, "tick-min-exceeded");
		require(newHigher != 0 && newLower != 0, "tick-val-zero");
	}

	// Compares the Standard Euro token to another token and returns them in ascending order
	function getAscendingPair(address _otherToken) private view returns (address token0, address token1) {
		(token0, token1) = sEuroToken < _otherToken
			? (sEuroToken, _otherToken)
			: (_otherToken, sEuroToken);
	}

	function isPoolInitialised() external view returns (bool) {
		return init;
	}

	// Initialises a pool with another token (address) and stores it in the array of pools.
	// Note that the price is in sqrtPriceX96 format.
	function initialisePool(address _otherAddress, uint160 _price, uint24 _fee)
	external onlyPoolOwner isNotInit {
		(address token0, address token1) = getAscendingPair(_otherAddress);
		fee = _fee;
		manager.createAndInitializePoolIfNecessary(
			token0,
			token1,
			_fee,
			_price
		);
		init = true;
	}

	function addLiquidity(uint256 _amountSeuro, uint256 _amountOther, address _other) private returns (PositionMetaData memory) {
		(address token0, address token1) = getAscendingPair(_other);

		(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) =
			token0 == sEuroToken ?
			(_amountSeuro, _amountOther, _amountSeuro, uint256(0)) :
			(_amountOther, _amountSeuro, uint256(0), _amountSeuro);

		// approve the contract to send the tokens to manager
		TransferHelper.safeApprove(token0, address(manager), amount0Desired);
		TransferHelper.safeApprove(token1, address(manager), amount1Desired);

		// send the tokens from the sender's account to the contract account
		TransferHelper.safeTransferFrom(token0, msg.sender, address(this), amount0Min);
		TransferHelper.safeTransferFrom(token1, msg.sender, address(this), amount1Min);


		INonfungiblePositionManager.MintParams memory params =
			INonfungiblePositionManager.MintParams({
			token0: token0,
			token1: token1,
			fee: fee,
			tickLower: tickLowerBound,
			tickUpper: tickHigherBound,
			amount0Desired: amount0Desired,
			amount1Desired: amount1Desired,
			amount0Min: amount0Min,
			amount1Min: amount1Min,
			recipient: address(this),
			deadline: block.timestamp
		});

		// provide liquidity to the pool
		(uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = manager.mint(params);
		emit mintPosition(msg.sender, tokenId, liquidity, amount0, amount1);
		
		// do a swap if amount0 contains the foreign token to keep sEURO first
		if (amount0 == _amountOther) (amount0, amount1) = (amount1, amount0);
		PositionMetaData memory pos = PositionMetaData(tokenId, liquidity, /* sEURO field */ amount0, /* other field */ amount1);
		return pos;

		//TODO: look into the refund mechanism again if needed, create tests to make sure nothing is "lost"
	}

	// We assume that there is a higher layer solution which helps to fetch the latest price as a quote.
	// This quote is being used to supply the two amounts to the function.
	// The reason for this is because of the explicit discouragement of doing this on-chain
	// due to the high gas costs (see https://docs.uniswap.org/protocol/reference/periphery/lens/Quoter).
	/// @param _amountSeuro The amount of sEURO token to bond
	/// @param _amountOther The amount of the other token to bond
	/// @param _otherToken The address of the other token
	/// @param _maturityInWeeks The amount of weeks a bond is active.
	///                          At the end of maturity, the principal + accrued interest is paid out all at once in TST.
	/// @param _rate The rate is represented as a 10,000-factor of each basis point so the most stable fee is 500 (= 0.05 pc)
	function bond(
		uint256 _amountSeuro,
		uint256 _amountOther,
		address _otherToken,
		uint256 _maturityInWeeks,
		uint256 _rate
	) public isInit {
		// information about the liquidity position after it has been successfully added
		PositionMetaData memory position = addLiquidity(_amountSeuro, _amountOther, _otherToken);
		// begin bonding event
		BondStorage.startBond(msg.sender, _amountSeuro, _rate, _maturityInWeeks, position);
	}
}
