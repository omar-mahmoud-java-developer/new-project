package com.enterprise.erp.modules.permissions;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Objects;

@Entity
@Table(name = "permissions")
public class Permission {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String code;

  private String description;

  protected Permission() {}

  public Permission(String code, String description) {
    this.code = code;
    this.description = description;
  }

  public Long getId() {
    return id;
  }

  public String getCode() {
    return code;
  }

  public String getDescription() {
    return description;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Permission other)) return false;
    return id != null && id.equals(other.id);
  }

  @Override
  public int hashCode() {
    return Objects.hashCode(id);
  }
}
