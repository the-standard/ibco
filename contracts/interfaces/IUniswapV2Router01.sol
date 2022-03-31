//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

interface IUniswapV2Router01 {
      function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
      external
      payable
      returns (uint[] memory amounts);
}