package com.mediconnect.auth.persistence;
import com.mediconnect.auth.domain.Account;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
public interface AccountRepository extends JpaRepository<Account,UUID> {
 Optional<Account> findByEmail(String email);
}
