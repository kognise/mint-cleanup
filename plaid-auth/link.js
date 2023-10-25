const { plaid } = require('./plaid')
const { Products } = require('plaid')

const makeLinkToken = async () => {
	const configs = {
		client_name: 'Kognise',
		user: { client_user_id: 'kognise' },
		products: [ Products.Auth, Products.Transactions ],
		country_codes: [ 'US' ],
		language: 'en'
	}
	console.log(await plaid.linkTokenCreate(configs))
}

const getTokens = async (publicToken) => {
	const tokenResponse = await plaid.itemPublicTokenExchange({
        public_token: publicToken
	})
	console.log(tokenResponse)
	console.log(`Access token: ${tokenResponse.data.access_token}`)
	console.log(`Item id: ${tokenResponse.data.item_id}`)
}
