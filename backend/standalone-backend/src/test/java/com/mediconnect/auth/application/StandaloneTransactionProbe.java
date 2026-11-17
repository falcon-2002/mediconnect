package com.mediconnect.auth.application;

import com.mediconnect.auth.domain.Account;
import com.mediconnect.auth.persistence.AccountRepository;
import org.springframework.transaction.annotation.Transactional;

/** Test-only: exposes a rollback after flush to detect the wrong service manager. */
public class StandaloneTransactionProbe {
    private final AccountRepository accounts;
    public StandaloneTransactionProbe(AccountRepository accounts) { this.accounts = accounts; }
    @Transactional public void insertThenFail(String email) {
        accounts.saveAndFlush(new Account(email, "synthetic-hash-not-used-for-login"));
        throw new IllegalStateException("synthetic rollback");
    }
}
