require('dotenv').config()

const requireEnv = (name) => {
	if (!process.env[name]) {
		throw new Error(`Missing environment variable: ${name}`)
	}
	return process.env[name]
}

module.exports = {
	maxHistory: Number(requireEnv('MAX_HISTORY')),
	email: requireEnv('EMAIL'),
	intuitPassword: requireEnv('INTUIT_PASSWORD'),
	intuitOtpSecret: requireEnv('INTUIT_OTP_SECRET'),
	intuitApiKey: requireEnv('INTUIT_API_KEY'),
	plaidClientId: requireEnv('PLAID_CLIENT_ID'),
	plaidSecret: requireEnv('PLAID_SECRET'),
	plaidAccessToken: requireEnv('PLAID_ACCESS_TOKEN'),
	plaidItemId: requireEnv('PLAID_ITEM_ID')
}