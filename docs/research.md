# Banking — sources, budget, and unresolved facts

Status: dated research basis from the design conversation on 2026-09-07, not a new live verification in this documentation task. Recheck terms, banks, prices, and platform properties before any decision that depends on them. No provider/Azure account was created or tested here.

Implementation update, 2026-09-07: the [official API reference](https://enablebanking.com/docs/api/reference/) was checked again for AIS payloads, `maximum_consent_validity` in seconds, continuation keys, account identity, transaction status/direction, and expiry/rate-limit error codes. The adapter has offline HTTP contract tests. This does not reverify prices, actual bank access, or Dan's account history. No live provider request was made by the application.

## Enable Banking

| Topic | Dated finding | Source |
|---|---|---|
| Personal use/price | The user's own linked accounts for personal use are covered by free terms; the number may be limited. Business use/other people's accounts are not the same scope | [Terms](https://enablebanking.com/terms/) |
| Activation | Restricted production and the app's subsequent bank authorization are separate steps | [Linked accounts](https://enablebanking.com/docs/api/linked-accounts) |
| Danske Bank | The official overview showed Denmark, AISP, production, and the Personal filter. Dan's specific account was not tested | [Bank catalogue](https://enablebanking.com/open-banking-apis) |
| Coverage | The website stated 2,700+ banks/30 countries; this is a marketing statement, not a guarantee for every account type | [Enable Banking](https://enablebanking.com/) |
| Rate limit | Many banks limit background fetching to four times per day; the concrete quota is bank-specific | [FAQ](https://enablebanking.com/docs/faq/) |
| History | History may be narrowed after the first authorization. The history length for Dan's account is unknown | [FAQ](https://enablebanking.com/docs/faq/) |
| Consent | The API catalogue states the bank's maximum; often 180 days, but the concrete value and earlier expiry must be handled | [FAQ](https://enablebanking.com/docs/faq/) |
| Import | `strategy=longest` and continuation pages are supported. Fully fetched means the entire period available through the API | [API reference](https://enablebanking.com/docs/api/reference/) |

Categorization is owned by Banking as a project requirement; there is no dependency on provider-supplied categories. A six-hour background sync is a proposal, not a verified Danske Bank quota. The account-linking limit, exact consent duration, and initial history remain unresolved.

## Reference product

The [Jakob Fisker post](https://www.linkedin.com/posts/jakob-fisker-87272327b_chatgpt-har-nu-fuld-adgang-til-min-%C3%B8konomi-ugcPost-7500191616767447040-GZP_/) inspires the overview, categorization, budgets, and later AI access. It does not define Banking scope or stack.

During the review on 2026-09-07, the entire public post and visible comments were read. LinkedIn showed 126 comments; the remaining comments required login, and Chrome/Dan was unavailable. The earlier review covered 89 comments/replies. **The full current comment thread has not been verified.** The rest can be revisited when browser access is available, without automatically expanding product requirements.

## Preliminary Azure budget — after approval only

The agreed revised planning estimate is **DKK 80–150/month excluding VAT**, without VNet, Private Endpoints, or Private DNS. It is not a verified bill or binding quote.

Assumptions: one user, 1–5 accounts, SQL database under 2 GB, small backup/log volumes, scale-to-zero, and available shared Container Apps free grant. The first history import and actual operation are measured before the final release budget.

| Baseline item | Dated basis / estimate |
|---|---|
| Azure SQL Basic, West Europe | DKK 1.0333/day, approximately DKK 31 for 730 hours |
| Container Registry Basic, West Europe | DKK 1.0692/day, approximately DKK 33 for 730 hours |
| Container Apps/Jobs | Preliminary DKK 0–30 at low usage and with free grant available |
| Storage, Key Vault, and Monitor | Small usage-dependent remainder; Private DNS excluded |

DKK 80–150 is a rounded planning range with uncertainty, not the sum of a complete SKU configuration. DNS for an owned domain, any Entra licenses, a ChatGPT subscription, and later AI model calls are not included. This documentation task created no Azure expense; existing subscription usage was not investigated.

Sources: [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), [Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing), and [SQL pricing](https://azure.microsoft.com/en-us/pricing/details/azure-sql-database/single/). DKK prices are indicative and depend on agreement/currency. See the [project plan's optional item](project-plan.md) for private networking; a new estimate is required if it is added.
