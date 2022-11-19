# mint-cleanup

intuit mint's integration with citibank sucks: transaction descriptions are useless, containing the date and time of the transaction but nothing about the merchant.

this tool adds proper descriptions from my bank to transactions in mint. it also strips date and time; transaction descriptions shouldn't be unique, that breaks budgeting tools.

also, since mint's matching rules don't work with post-renamed transactions, this also recategorizes some transactions automatically.

![Screenshot](https://doggo.ninja/2PnE8o.png)

## how?

- headless chrome instance to log into intuit mint
- imap to fetch mint's 2fa codes from my email automatically
- plaid to fetch transactions from citibank

i run this with a cronjob every midnight on one of my servers. this was designed as a personal tool, but feel free to riff off of my code for your own purposes!