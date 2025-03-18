.PHONY: setup lint validate

setup:
	sudo apt-get update && sudo apt-get install -y nodejs
	corepack enable
	yarn install

list:
	yarn compile
