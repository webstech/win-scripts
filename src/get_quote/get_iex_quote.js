#!/usr/bin/env node

// Update stock quotes by scraping from the web.

// The quotes can be used in vlookup in spreadsheets.
// Quotes from tmxmoney are scraped based on specific data format.
// Quotes from ? are just the data.
// The intention is to make spreadsheets more responsive with this command
// scheduled to run once a day.

// Initial run with --init option.  The git config must be updated with the
// sources, symbols and filters associated with each source.  The updates can be done
// interactively during init processing.

// git config --add quote.sources "tsx iex tdn"
// git config --add tsx.quotes "ry"
// git config --add tsx.filter "span.([0-9.]+)..span"
// git config --add tsx.url https://web.tmxmoney.com/quote.php?qm_symbol=$SYM$
// git config --add iex.quotes "aapl hd txn vlo"
// git config --add iex.filter ([0-9.]+)
// git config --add iex.url https://cloud.iexapis.com/stable/stock/$SYM$/quote/latestPrice?token=pk_feeddeadbeef
// git config --add tdn.quotes "1428"
// git config --add tdn.filter \n\s+([0-9.]+)\s*\r*\n
// git config --add tdn.url https://www.tdstructurednotes.com/snp/noteDetails.action?noteId=$SYM$

import axios from 'axios';
import * as child_process from "child_process";
import commander from "commander";
import dogit from "dugite";
import * as fs from "fs";
import * as readline from "readline";
import * as util from "util";

const desc = `
Get a quote from iex using the api.  If the symbol is not found,
the symbol table will be downloaded and similar symbols listed.

This can be useful for symbols that may have a suffix to the name
but it is not clear what it should be.`

const execFile = util.promisify(child_process.execFile);
const mkdir = util.promisify(fs.mkdir);
const access = util.promisify(fs.access);

commander.version("1.0.0")
    .usage("symbol [options]")
	.description(desc)
	.arguments("<symbol>")
    .option("-a, --all",
            "Show all the values, including null",
            undefined)
    .option("-d, --dir [directory]",
            "Use a different directory than ~/Documents/My Money Docs/quotes"
            + "`gitgitgadget.workDir`",
            undefined)
	.parse(process.argv);

const symbol = commander.args[0];
const commandOptions = commander.opts();

// console.log(os.userInfo());
(async () => {
	if (!commandOptions.dir) {
		commandOptions.dir = await getDefaultDir();
	}

	const filter = commandOptions.all ? "" : "null";
	const check = new RegExp(filter, "i");
	const tokenSuffix = await git(["config", "--get", `iex.token`]);
	const token = `?token=${tokenSuffix}`;
	const url = "https://cloud.iexapis.com/stable/"
	const uri = `${url}stock/${symbol}/quote${token}`;

	try {
		const response = await axios.get(uri);

		for (const [key, value] of Object.entries(response.data)) {
			if (commandOptions.all || !check.test(value)) {
				console.log(`${key.padEnd(18, ".")}: ${value}`);
			}
		}
	} catch (error) {
		console.log(`Symbol ${commander.args[0]} not found.  Checking for similar symbols`);
		const uri = `${url}ref-data/region/ca/symbols${token}`;

		try {
			const response = await axios.get(uri);
			const matcher = new RegExp(symbol, "i");
			response.data.map( obj => {
				if (matcher.test(obj.symbol)) {
					console.log(`${obj.symbol} ${obj.name}`);
				}
			});
		} catch (error) {
			console.log(`some commmand failed\n${error}`);
		}
	}
})().catch((reason) => {
    console.log(`Caught error ${reason}:\n${reason.stack}\n`);
    process.stderr.write(`Caught error ${reason}:\n${reason.stack}\n`);
    process.exit(1);
});

async function getDefaultDir() {
	const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders";
	const {stdout} = await execFile('reg', ["query", key, "/v", "Personal"], { encoding: 'utf-8' });
	const match = stdout.match(/Personal\s+REG_SZ\s+(\S+)/);

	if (!match) {
		throw new error("Unable to determine default directory");
	}

	return  `${match[1]}/My Money Docs/quotes`;
}

async function git(args) {
	const result = await dogit.GitProcess.exec(args, commandOptions.dir)

	if (result.exitCode === 0) {
	  const output = result.stdout.replace(/\r?\n$/, "");

	  return output;
	} else {
	  throw new Error(`Git failed\n${result.stderr}`);
	}
}
