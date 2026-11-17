package com.mediconnect.standalone;

import java.lang.reflect.Method;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.interceptor.*;

/** Qualify existing @Transactional annotations without editing domain sources.
 * Spring Data repository transactions already use their explicit manager refs. */
@Configuration(proxyBeanMethods = false)
@EnableTransactionManagement
public class DomainTransactions {
    @Bean @Primary TransactionAttributeSource domainTransactionQualifiers(
            @Qualifier("transactionAttributeSource") TransactionAttributeSource original) {
        return new TransactionAttributeSource() {
            @Override public TransactionAttribute getTransactionAttribute(Method method, Class<?> targetClass) {
                var attribute = original.getTransactionAttribute(method, targetClass);
                if (attribute == null || targetClass == null
                        || (attribute.getQualifier() != null && !attribute.getQualifier().isBlank())) return attribute;
                String unit = unitFor(targetClass.getName());
                if (unit == null) return attribute;
                return new DelegatingTransactionAttribute(attribute) {
                    @Override public String getQualifier() { return unit + "TransactionManager"; }
                };
            }
        };
    }
    static String unitFor(String className) {
        for (String unit : new String[]{"auth", "patient", "doctor", "appointment"})
            if (className.startsWith("com.mediconnect." + unit + ".")) return unit;
        return null;
    }
}
