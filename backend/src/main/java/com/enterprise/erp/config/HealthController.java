package com.enterprise.erp.config;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {

  @GetMapping("/health")
  public Map<String, Object> health() {
    return status("UP", "health");
  }

  @GetMapping("/ready")
  public Map<String, Object> ready() {
    return status("READY", "readiness");
  }

  private Map<String, Object> status(String status, String probe) {
    return Map.of(
        "service", "enterprise-erp",
        "probe", probe,
        "status", status,
        "timestamp", Instant.now().toString());
  }
}
