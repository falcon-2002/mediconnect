package com.mediconnect.appointment.config;
import java.time.Clock;
import java.time.Duration;
import org.springframework.context.annotation.*;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
@Configuration
public class ClientConfig {
 @Bean Clock clock(){return Clock.systemUTC();}
 @Primary @Bean RestClient.Builder eurekaRestClientBuilder(){return RestClient.builder();}
 @Bean(name="serviceClient") @LoadBalanced RestClient.Builder serviceClient(){
  var factory=new SimpleClientHttpRequestFactory();factory.setConnectTimeout(Duration.ofSeconds(3));factory.setReadTimeout(Duration.ofSeconds(3));
  return RestClient.builder().requestFactory(factory);
 }
}
