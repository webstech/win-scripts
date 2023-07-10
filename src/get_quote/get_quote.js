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
import { Command } from "commander";
import dogit from "dugite";
import { readFile } from 'node:fs/promises';
import { access, mkdir, writeFile } from "fs/promises";
import mysql from "mysql";
import { env } from 'process';
import * as readline from "readline";
import * as util from "util";

const execFile = util.promisify(child_process.execFile);

// collect filter values
// const filters =  [];
function collect(value, previous) {
	return previous.concat([value]);
}

const commander = new Command();

commander.version("1.0.0")
	.usage("[options]")
	.description("Scrape some quotes off the web")
	.option("-d, --dir [directory]",
		"Use a different directory than ~/Documents/My Money Docs/quotes.",
		undefined)
	.option("--debug",
		"Trace extra scum messages")
    .option("-a, --all",
		"Save all quotes even if not found.\n\nHelps if some quotes must be manually entered.")
    .option("-u, --update",
		"Load the initial quotes from the file.\n\nHelps if some quotes must be manually entered.")
	.option("-f, --filter [source]",
		"Only update the named source.  Multiple filters may be specified.",
		collect, [])
	.option("-g, --group [source]",
		"Only update the named source.  Multiple groups may be specified.",
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

const commandOptions = commander.opts();

const debugLog = (body) => {
	return console.log(body);
};
const nodebugLog = () => { };

const debug = commandOptions.debug ? debugLog : nodebugLog;

// Do not save if filter - usually a test
if (commandOptions.filter.length || commandOptions.group.length) {
    commandOptions.db = undefined;
    commandOptions.file = undefined;
}

(async () => {
	if (!commandOptions.dir) {
		commandOptions.dir = await getDefaultDir();
	}

	if (commandOptions.init) {
		return await init(commandOptions.dir);
	}

	try {
		const quotes = commandOptions.update ? await loadQuotes(`${commandOptions.dir}/${commandOptions.file}`)
                                             : new Map();
        const groups = await git(["config", "--get", `quote.sources`]);
		debug(`groups: ${groups}`);

		const connection = commandOptions.db ? connectDB({
			host: 'localhost',
			user: 'loadquotes',
			// password : 'secret',
			database: commandOptions.db
		}) : fauxConnectDB();

		const fallbackGroups = [];

		for (const group of groups.split(" ").filter(value => !commandOptions.group.length || commandOptions.group.includes(value))) {
			const fallback = await processGroup(quotes, connection, group);
			if (fallback) {
				fallbackGroups.push(fallback);
			}
		}

		if (fallbackGroups.length) {
			debug(`starting post`);
			debug(fallbackGroups);

			for (const group of fallbackGroups) {
				await processGroup(quotes, connection, group.name, group.reference, group.symbols);
			}
		}

        await connection.close();
        const quoteString = [...quotes].filter(([k, v]) => commandOptions.all || v ).sort().join("\n");
		// console.log(quotes);
		debug(`quotes collected\n${quoteString}`);

		if (commandOptions.file) {
			await writeFile(`${commandOptions.dir}/${commandOptions.file}`, quoteString);
		}

	} catch (error) {
		console.log(`some commmand failed\n${error}`);
	}
})().catch((reason) => {
	console.log(`Caught error ${reason}:\n${reason.stack}\n`);
	process.stderr.write(`Caught error ${reason}:\n${reason.stack}\n`);
	process.exit(1);
});

async function processGroup(quotes, connection, group, baseGroup = undefined, symbolsIn = undefined ) {
	const symbols = symbolsIn ? symbolsIn
							  : (await git(["config", "--get", `${group}.quotes`])).split(" ");
	const url = await git(["config", "--get", `${group}.url`]);
	const alternateGroup = await git(["config", "--default", "", "--get", `${group}.alternate`]);
	const filter = await git(["config", "--get", `${group}.filter`]);
    const getter = await git(["config", "--default", "", "--get", `${group}.getter`]);
	const table = await git(["config", "--default", baseGroup ? baseGroup : group, "--get", `${group}.table` ]);
	const filterRegex = new RegExp(filter);
    const insert = `insert into ${table} set ?`;
	let fallback;
	debugLog(`Group ${group}${baseGroup ? `: fallback from ${baseGroup}` : ""} Table: ${table}`);

    for (const symbol of symbols) {
		const uri = url.replace(/\$SYM\$/, symbol.replace(/\./g, "-"));
		debug(`Requesting ${symbol} from ${uri}`);

		let quote;
		try {
			const response = await getData(uri, symbol);
			// console.log(typeof (response.data));

			if (typeof (response.data) === "string") {
				const quoteMatch = filterRegex.exec(response.data);
				if (quoteMatch) {
					quote = quoteMatch[1];
				} else {
					continue;
				}
			} else {
                if (!getter) {
                    quote = response.data.toString();
                } else {
                    const exports = await import(getter);
                    quote = await exports.default(symbol, response.data);
                }
			}
		} catch (error) {
			console.log(`Get failed for ${symbol} at ${uri}\n${error}`);
			if (alternateGroup) {
				if (fallback) {
					fallback.symbols.push(symbol);
				} else {
					fallback = {name: alternateGroup, symbols: [ symbol ], reference: group };
				}

				debug(fallback);
			}
		}

		if (quote) {
			try {
				await connection.query(insert, { "symbol": symbol, "price": quote });
			} catch (error) {
				console.log(`Insert failed\n${error}`);
			}
		} else {
			console.log(`No quote found for ${symbol}`);
			// debug(`searching for ${filter}:\n${response.data.toString()}`);
		}

        // set to new, existing, or zero.
        quotes.set(symbol, quote || quotes.get(symbol) || 0);
	}

	return fallback;
}

// Check for file override in env var - primarily used for testing regex
async function getData(uri, symbol) {
    const varName = `GET_QUOTE_${symbol}`;
    if (!env[varName]) {
        return await axios.get(uri);
    } else {
        const fileName = env[varName];
        const response = {data: ""};
        debugLog(`Reading file ${fileName} for symbol ${symbol} data`)
        response.data = await readFile(fileName, { encoding: 'utf8' });
        return response;
    }
}

async function loadQuotes(fileName) {
    debug(`Reading file ${fileName}`)
    const csv = await readFile(fileName, { encoding: 'utf8' });
    const quotes = new Map(csv.split(/\n/).map(l => l.split(",")));
    debug(quotes);
    return quotes;
}

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