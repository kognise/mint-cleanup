const puppeteer = require('puppeteer')
const fetch = require('node-fetch-commonjs')
const { ImapFlow } = require('imapflow')
const { plaid } = require('./plaid-auth/plaid')
const { oneYearFromNow, delay, url } = require('./util')
const { maxHistory, email, intuitPassword, gmailPassword, intuitApiKey, plaidAccessToken } = require('./env')
const { categoryMatchers } = require('./categorizer')

const gmail = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
	logger: false,
    auth: {
        user: email,
        pass: gmailPassword
    }
})

const collectOtp = async (clickTime) => {
	await gmail.connect()
	await delay(1000)
	
	for (let i = 0; i < 12; i++) {
		await gmail.mailboxOpen('INBOX')
		try {
			const message = await gmail.fetchOne(gmail.mailbox.exists, { envelope: true })

			// Weird buffer needed due to time inaccuracies:
			message.envelope.date.setSeconds(message.envelope.date.getSeconds() + 15)

			if (clickTime < message.envelope.date && message.envelope.subject.endsWith('Mint code')) {
				try {
					await gmail.messageDelete(message.uid, { uid: true })
				} catch (error) {
					console.error(error)
				}
				await gmail.mailboxClose()
				await gmail.logout()
				return message.envelope.subject.split(' ')[0]
			}
		} catch {}
		await gmail.mailboxClose()
		await delay(5 * 1000)
	}
	
	await gmail.logout()
	throw new Error('Could not collect OTP in time')
}

const isOverview = async (page) => page.url().startsWith('https://mint.intuit.com/overview')

const mintFetch = async (page, url, method, body) => {
	return await page.evaluate(async ({ intuitApiKey, url, method, body }) => {
		const res = await fetch(url, {
			method,
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Intuit_APIKey intuit_apikey=${intuitApiKey},intuit_apikey_version=1.0`,
			},
			body: JSON.stringify(body)
		})
		if (!res.ok) throw new Error(`Mint returned status ${res.status}`)
		const text = await res.text()
		try {
			return JSON.parse(text)
		} catch {
			return text
		}
	}, { intuitApiKey, url, method, body })
}

const updateMintTransaction = async (page, transactionId, data) => {
	await mintFetch(
		page,
		`https://mint.intuit.com/pfm/v1/transactions/${transactionId}`,
		'PUT',
		{
			...data,
			type: 'CashAndCreditTransaction'
		}
	)
}

const getMintTransactions = async (page, rangeConfig) => {
	const json = await mintFetch(
		page,
		'https://mint.intuit.com/pfm/v1/transactions/search',
		'POST',
		{
			dateFilter: {
				type: 'CUSTOM',
				startDate: '2007-01-01',
				endDate: oneYearFromNow().toISOString().slice(0, 10)
			},
			limit: rangeConfig.count,
			offset: rangeConfig.offset,
			searchFilters: [],
			sort: 'DATE_DESCENDING'
		}
	)
	
	return {
		transactions: json.Transaction,
		total: json.metaData.totalSize
	}
}

const getMintCategories = async (page) => {
	const json = await mintFetch(page, 'https://mint.intuit.com/pfm/v1/categories', 'GET')
	return json.Category
}

const getPlaidTransactions = async (rangeConfig) => {
	const transactions = await plaid.transactionsGet({
		options: {
			count: rangeConfig.count,
			offset: rangeConfig.offset
		},
		access_token: plaidAccessToken,
		start_date: '2007-01-01',
		end_date: oneYearFromNow().toISOString().slice(0, 10)
	})
	return {
		transactions: transactions.data.transactions,
		total: transactions.data.total_transactions
	}
}

const stripRegexes = [
	/^(.+)\sDebit Card Purchase \d{2}\/\d{2} (?:\d{2}:\d{2}[ap] )?#\d{4}$/,
	/^(.+)\sMobile Purchase Sign Based \d{2}\/\d{2} (?:\d{2}:\d{2}[ap] )?#\d{4}$/,
	/^(.+)\sMobile Purchase Returns \d{2}\/\d{2} (?:\d{2}:\d{2}[ap] )?#\d{4}$/,
	/^(.+)\sDebit PIN Purchase$/,
	/^(.+)\sMobile Purchase PIN Based$/,
	/^ONLINE Reference # \d{5,7}\s(.+)\s\d{2}\/(?:\d{2} )?(?:\d{2}:\d{2}[ap] )?#\d{4}$/,
	/^(.+)\s\d{2}\/\d{2} (?:\d{2}:\d{2}[ap] )?#\d{4}$/,
	/^# \d{2,4} (Check)$/
]

const transactionName = (name) => {
	for (const regex of stripRegexes) {
		const match = name.match(regex)
		if (match) return match[1]
	}
	return null
}

const overviewOrOtp = async (page) => await Promise.race([
	page.waitForSelector('.pfm-overview-ui'),
	page.waitForSelector('[data-testid=challengePickerOption_EMAIL_OTP]'),
])

const go = async () => {
	const browser = await puppeteer.launch({
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	})
	console.log('Browser launched')

	const page = await browser.newPage()
	await page.goto(url('https://accounts.intuit.com/index.html', {
		offering_id: 'Intuit.ifs.mint',
		redirect_url: 'https://mint.intuit.com/overview.event'
	}))

	console.log('Entering email...')
	await page.type('[data-testid=IdentifierFirstIdentifierInput]', email)
	await page.click('[data-testid=IdentifierFirstSubmitButton]')

	console.log('Entering password...')
	await page.waitForSelector('[data-testid=currentPasswordInput]')
	await page.type('[data-testid=currentPasswordInput]', intuitPassword)
	await Promise.all([
		overviewOrOtp(page),
		page.click('[data-testid=passwordVerificationContinueButton]')
	])

	if (!await isOverview(page)) {
		const clickTime = new Date()
		await page.click('[data-testid=challengePickerOption_EMAIL_OTP]')

		console.log('Collecting OTP from Gmail...')
		const otp = await collectOtp(clickTime)
		console.log('OTP collected!')
		await page.type('[data-testid=VerifyOtpInput]', otp)
		await Promise.all([
			overviewOrOtp(page),
			page.click('[data-testid=VerifyOtpSubmitButton]')
		])
	}
	if (!await isOverview(page)) throw new Error('Could not log in')

	console.log('Logged in and on Mint dashboard!')

	const plaidPageSize = 500
	const mintPageSize = 100

	let plaidTransactions = []
	let plaidOffset = 0
	while (true) {
		console.log(`Offset ${plaidOffset} of Plaid transactions...`)
		const data = await getPlaidTransactions({ count: plaidPageSize, offset: plaidOffset })
		plaidTransactions = plaidTransactions.concat(data.transactions)
		if (plaidTransactions.length >= Math.min(data.total, maxHistory)) break
		plaidOffset += plaidPageSize
	}

	const categories = await getMintCategories(page)
	console.log(`Fetched ${categories.length} Mint categories`)

	let mintOffset = 0
	let mintReceived = 0
	while (true) {
		console.log(`Offset ${mintOffset} of Mint transactions...`)
		const data = await getMintTransactions(page, {
			count: mintPageSize,
			offset: mintOffset
		})

		for (const mintTransaction of data.transactions) {
			if (mintTransaction.type !== 'CashAndCreditTransaction') continue

			const plaidTransaction = plaidTransactions
				.find(t => t.date === mintTransaction.date && t.amount === -mintTransaction.amount)
			if (mintTransaction.isPending || plaidTransaction?.pending) continue
			if (!plaidTransaction) {
				console.warn(`Could not find matching Plaid transaction for "${mintTransaction.description}" on ${mintTransaction.date} for ${mintTransaction.amount.toFixed(2)}`)
			}

			const newName = plaidTransaction
				? transactionName(plaidTransaction.name) || plaidTransaction.name
				: transactionName(mintTransaction.description) || mintTransaction.description

			const newCategory = categoryMatchers
				.find(([ regex ]) => regex.test(newName))
			const newCategoryId = newCategory && categories.find(c => c.name === newCategory[1])?.id

			const nameChanged = newName !== mintTransaction.description
			const categoryChanged = newCategoryId && newCategoryId !== mintTransaction.category.id
			if (!nameChanged && !categoryChanged) continue

			await updateMintTransaction(page, mintTransaction.id, {
				description: nameChanged ? newName : undefined,
				category: categoryChanged ? { id: newCategoryId } : undefined
			})
			console.log('Updated transaction!')
			console.log(`> Name: "${mintTransaction.description}"`)
			if (nameChanged) {
				console.log(`>   To: "${newName}"`)
			}
			if (categoryChanged) {
				console.log(`> From: ${mintTransaction.category.name}`)
				console.log(`>   To: ${newCategory[1]}`)
			}
		}

		mintReceived += data.transactions.length
		if (mintReceived >= Math.min(data.total, maxHistory)) break
		mintOffset += mintPageSize
	}

	console.log('Donesies!')
	await browser.close()
}

go()