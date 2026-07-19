output "frontend_url" {
  value = "https://${local.frontend_hostname}"
}

output "api_url" {
  value = "https://${local.api_hostname}"
}
