const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid')
const { plaidClientId, plaidSecret } = require('../env')

const plaidConfig = new Configuration({
	basePath: PlaidEnvironments['development'],
	baseOptions: {
		headers: {
			'PLAID-CLIENT-ID': plaidClientId,
			'PLAID-SECRET': plaidSecret,
			'Plaid-Version': '2020-09-14'
		}
	}
})

module.exports.plaid = new PlaidApi(plaidConfig)