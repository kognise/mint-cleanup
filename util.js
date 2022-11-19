module.exports.oneYearFromNow = () => {
	const date = new Date()
	date.setFullYear(date.getFullYear() + 1)
	return date
}

module.exports.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

module.exports.url = (base, query) => {
	const url = new URL(base)
	Object.keys(query).forEach(key => url.searchParams.append(key, query[key]))
	return url.toString()
}