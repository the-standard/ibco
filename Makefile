.DEFAULT_GOAL := build
.PHONY: test

build:
	@npx hardhat compile

test:
	@npx hardhat test --parallel

testStage1:
	@npx hardhat test --parallel test/stage1/*.js

testStage2:
	@npx hardhat test --parallel test/stage2/*.js

testStage3:
	@npx hardhat test --parallel test/stage3/*.js

clean:
	@rm -rf node_modules/ && npm install

cov:
	@npx hardhat coverage

size:
	@npx hardhat size-contracts

lint:
	@npx eslint test/
