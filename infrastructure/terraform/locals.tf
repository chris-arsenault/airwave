locals {
  prefix      = "airwave"
  domain_name = "ahara.io"

  api_hostname      = "api.airwave.${local.domain_name}"
  frontend_hostname = "airwave.${local.domain_name}"
}
