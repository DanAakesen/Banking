namespace Banking.Api.Services;

// Technical application-registration metadata; these are plain-text documents, not product screens.
public static class LegalText
{
    public const string CloudPrivacy = """
        Banking — personal application privacy information
        Owner/contact: Dan@novaro.dk. Private financial access is restricted to Dan.
        Accounts, transactions, categories, budgets, goals and photos are stored in Microsoft Azure, West Europe.
        Read-only bank access is provided by Enable Banking with the bank's official authorization flow. Banking never receives MitID credentials.
        Demo is public and uses fictional data. Its editable session copies expire after eight hours and are reclaimed when new sessions are allocated.
        Do not enter personal or confidential information into Demo. Security cookies are required for sign-in and session isolation.
        Passwords are verified against a protected hash. Application secrets are protected in Azure application configuration.
        Bank data, passwords and secrets are not included in ordinary application logs. History remains after bank disconnection.
        Azure backups and encrypted recovery copies can retain deleted data for their configured retention period.
        AI and voice are not active. No financial data is currently sent to an AI provider.
        Updated 12 September 2026.
        """;
    public const string CloudTerms = """
        Banking — personal application terms
        This is Dan's personal, non-commercial financial application. Demo is a fictional demonstration; private financial access is owner-only.
        Banking does not execute payments, transfers or trades. Figures depend on bank coverage, synchronization and user classifications.
        Historical figures and estimates are not guarantees. Demo changes are temporary and not a place to store personal information.
        Enable Banking and bank authorization remain subject to their own terms. Contact: Dan@novaro.dk.
        """;
    public const string Privacy = """
        Banking — personal local application privacy information

        Owner and data protection contact: Dan@novaro.dk.
        Banking is for the owner's personal, non-commercial use with the owner's own accounts.
        It reads account information, balances, and transactions through Enable Banking and the bank's official authorization flow.
        Banking never requests or stores MitID credentials and does not initiate payments or transfers.
        Financial history, classifications, budgets, and balance snapshots are stored locally on the owner's computer during development.
        Demo data is stored separately. Demo operations do not contact a real bank.
        Bank data and secrets are excluded from ordinary application logs. Backups are encrypted.
        Imported history is retained when a bank connection expires or is disconnected, so it remains available to the owner.
        Enable Banking and the bank process authorization and account-access requests under their own terms.
        No ChatGPT/MCP access or Azure deployment is active. Any future external hosting or AI sharing requires a separate owner decision.
        This local document describes the development application as of 2026-09-07.
        """;
    public const string Terms = """
        Banking — personal local application terms

        This application is developed and operated by its owner, contact Dan@novaro.dk, for personal non-commercial use only.
        Access is restricted to the owner and accounts linked with that owner's authorization.
        Banking provides read-only bank information and local tools for categorization and budgeting. It does not execute payments or transfers.
        Bank availability, history, and freshness depend on the bank and Enable Banking. The application shows import status and preserves previously loaded history.
        Demo mode uses separate synthetic data. Its figures are not the owner's real finances.
        The bank's official flow handles identity and consent, including MitID. The owner can stop local synchronization and close the provider session without deleting stored history.
        Enable Banking and bank services remain subject to their respective terms and authorization requirements.
        This is a local development application, not a public or commercial financial service.
        """;
}
