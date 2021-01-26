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
import mysql from "mysql";
import * as readline from "readline";
import * as util from "util";

const execFile = util.promisify(child_process.execFile);
const mkdir = util.promisify(fs.mkdir);
const access = util.promisify(fs.access);

// collect filter values
// const filters =  [];
function collect(value, previous) {
	return previous.concat([value]);
}

commander.version("1.0.0")
	.usage("[options]")
	.description("Scrape some quotes off the web")
	.option("-d, --dir [directory]",
		"Use a different directory than ~/Documents/My Money Docs/quotes"
		+ "`gitgitgadget.workDir`",
		undefined)
	.option("--debug",
		"Trace extra scum messages")
	.option("-f, --filter [source]",
		"Only update the named source.  Multiple filters may be specified.",
		collect, [])
	.option("--file <fileName>",
		"CSV file to be generated.",
		"quotes.csv")
	.option("--no-file", "Do not generate csv file.")
	.option("--db <databaseName>", "Database to save quotes in.", "quotes")
	.option("--no-db", "Do not update the database.")
	.option("-i, --init",
		"Initialize the directory.  Used prior to regular runs.")
	.parse(process.argv);

// console.log(os.userInfo());
const commandOptions = commander.opts();
const debugLog = (body) => {
	return console.log(body);
};
const nodebugLog = () => { };

const debug = commandOptions.debug ? debugLog : nodebugLog;

(async () => {
	if (!commandOptions.dir) {
		commandOptions.dir = await getDefaultDir();
	}

	if (commandOptions.init) {
		return await init(commandOptions.dir);
	}

	try {
		const quotes = [];
		const groups = await git(["config", "--get", `quote.sources`]);
		// console.log(`groups ${groups}`);

		const connection = commandOptions.db ? connectDB({
			host: 'localhost',
			user: 'loadquotes',
			// password : 'secret',
			database: commandOptions.db
		}) : fauxConnectDB();

		for (const group of groups.split(" ")) {
			const symbols = await git(["config", "--get", `${group}.quotes`]);
			const url = await git(["config", "--get", `${group}.url`]);
			const filter = await git(["config", "--get", `${group}.filter`]);
			const filterRegex = new RegExp(filter);
			const insert = `insert into ${group} set ?`;

			for (const symbol of symbols.split(" ")) {
				const uri = url.replace(/\$SYM\$/, symbol.replace(/\./g, "-"));
				debugLog(`Requesting ${uri}`);

				let quote;
				try {
					const response = await axios.get(uri);

					if (typeof (response.data) === "string") {
						const quoteMatch = filterRegex.exec(response.data);
						if (quoteMatch) {
							quote = quoteMatch[1];
						} else {
							continue;
						}
					} else {
						quote = response.data.toString();
					}
				} catch (error) {
					console.log(`Get failed\n${error}`);
					continue;
				}

				if (quote) {
					quotes.push(`${symbol},${quote}`);
					try {
						await connection.query(insert, { "symbol": symbol, "price": quote });
					} catch (error) {
						console.log(`Insert failed\n${error}`);
					}
				} else {
					console.log(`No quote found for ${symbol}`);
					debugLog(`searching for ${filter}:\n${response.data.toString()}`);
				}
			}
		}

		await connection.close();

		if (commandOptions.file) {
			quotes.sort();

			const csvFile = fs.createWriteStream(`${commandOptions.dir}/${commandOptions.file}`);
			quotes.map((quote) => {
				csvFile.write(`${quote}\n`);
			});
			csvFile.close();
		}

	} catch (error) {
		console.log(`some commmand failed\n${error}`);
	}
})().catch((reason) => {
	console.log(`Caught error ${reason}:\n${reason.stack}\n`);
	process.stderr.write(`Caught error ${reason}:\n${reason.stack}\n`);
	process.exit(1);
});

async function getDefaultDir() {
	const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders";
	const { stdout } = await execFile('reg', ["query", key, "/v", "Personal"], { encoding: 'utf-8' });
	// console.log('Output was:\n', stdout);
	const match = stdout.match(/Personal\s+REG_SZ\s+(\S+)/);
	// console.log(`x${match[1]}x`);
	if (!match) {
		throw new error("Unable to determine default directory");
	}
	// const val = 'reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v "Personal"'
	return `${match[1]}/My Money Docs/quotes`;
}

async function init(dir) {
	console.log(`Initializing ${dir}`);

	// if access fails, mkdir
	try {
		await access(dir, fs.constants.W_OK);
	} catch (error) {
		await mkdir(dir, { recursive: true });
	}

	// git status on working dir
	try {
		const status = await git(["status"]);
	} catch (error) {
		try {
			const status = await git(["init"]);
		} catch (error) {
			console.log(`init failed\n${error}`);
		}
	}

	let rlQuestion = (q) => {
		return new Promise((res, rej) => {
			rl.question(q, answer => { console.log(answer); res(answer) });
		});
	}

	// query for groups, quotes per group and regexes
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	const groups = [];
	let looping = true;
	while (looping) {
		const group = await rlQuestion('Enter the name of a group or null to end ');

		console.log(`Collecting quotes for group: ${group}`);

		if (!group) {
			break;
		}

		groups.push(group);

		let quotes = [];
		let quoteLoop = true;
		while (quoteLoop) {
			const symbols = await rlQuestion(`Enter symbol(s) or null to end.${quotes.length ? ` Symbols ${quotes.join(" ")}` : ""}\n`);
			console.log(`Symbols: ${quotes.length} ${symbols}`);
			// TODO: Log the answer in a database
			if (!symbols) {
				break;
			}

			quotes.push(...symbols.split(/\s+/).filter((i) => i));
		}

		if (quotes.length) {
			console.log(`Symbols: ${quotes}`);
			const url = await rlQuestion('Enter the url or null to skip ');
			const filter = await rlQuestion('Enter the search filter or null to skip ');

			try {
				await git(["config", "--add", `${group}.quotes`, `"${quotes.join(" ")}"`]);

				if (url) {
					await git(["config", "--add", `${group}.url`, `"${url}"`]);
				}

				if (filter) {
					await git(["config", "--add", `${group}.filter`, `"${filter}"`]);
				}
			} catch (error) {
				console.log(`git commmand failed\n${error}`);
			}
		}
	}

	if (groups.length) {
		try {
			const status = await git(["config", "--add", `quote.sources`,
				`"${groups.join(" ")}"`]);
			console.log(`status ${status}`);
		} catch (error) {
			console.log(`git commmand failed\n${error}`);
		}
	} else {
		console.log("Rerun --init or enter git commands to set up for use")
	}

	rl.close();
	console.log("init has completed");
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

function connectDB(config) {
	const connection = mysql.createConnection(config);
	const queryAwait = util.promisify(connection.query);
	return {
		query(sql, args) {
			return queryAwait.call(connection, sql, args);
		},
		close() {
			return util.promisify(connection.end).call(connection);
		}
	};
}

function fauxConnectDB() {
	return {
		query() {},
		close() {}
	};
}