# The backend's machine identity.
#
# It reads its collector token at start with the certificate the trust
# appliance issued it, rather than receiving a value the deploy pipeline
# resolved into Komodo (ahara-trust ADR-0002).
#
# No policy is passed: reading this project's parameters is all it does with
# credentials, and machine-role derives that from the prefix, so no list of
# parameters is written anywhere.

data "aws_caller_identity" "workload" {}

module "backend_workload_role" {
  source = "git::https://github.com/chris-arsenault/ahara-infra.git//infrastructure/terraform/modules/machine-role?ref=main"

  prefix = local.prefix
  name   = "backend"

  permissions_boundary_arn = (
    "arn:aws:iam::${data.aws_caller_identity.workload.account_id}:policy/pb-${local.prefix}-truenas-workload"
  )
}
