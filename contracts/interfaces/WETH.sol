//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

interface WETH {
  function deposit() external payable;
  function withdraw(uint wad) external;

  function allowance(address _owner, address spender) external returns(uint256);
  function approve(address _address, uint256 amount) external returns(bool);
  function burn(address _address, uint256 amount) external;
  function transfer(address _address, uint256 amount) external;
  function transferFrom(address owner, address buyer, uint256 amount) external;
  function mint(address _address, uint256 amount) external;
}