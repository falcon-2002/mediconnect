package com.mediconnect.appointment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
/** Uses ONLY an explicitly provisioned disposable schema; inherited tests clear its tables. */
class AppointmentMySqlIT extends AppointmentApiTest {
 @DynamicPropertySource static void mysql(DynamicPropertyRegistry r){
  String url=System.getenv("APPOINTMENT_TEST_DB_URL");
  if(url==null||!url.matches("jdbc:mysql://[^/]+/mediconnect_appointment_test(?:[?].*)?"))throw new IllegalStateException("Set APPOINTMENT_TEST_DB_URL to dedicated mediconnect_appointment_test schema");
  r.add("spring.datasource.url",()->url);r.add("spring.datasource.driver-class-name",()->"com.mysql.cj.jdbc.Driver");
  r.add("spring.datasource.username",()->System.getenv("APPOINTMENT_TEST_DB_USER"));
  r.add("spring.datasource.password",()->System.getenv("APPOINTMENT_TEST_DB_PASSWORD"));
 }
}
