data "aws_lb_target_group" "reverse_proxy" {
  name = "ahara-proxy-tg"
}

module "api" {
  source = "git::https://github.com/chris-arsenault/ahara-tf-patterns.git//modules/alb-api-truenas"

  hostname         = local.api_hostname
  alb              = module.ctx.alb
  cognito          = module.ctx.cognito
  target_group_arn = data.aws_lb_target_group.reverse_proxy.arn

  routes = [
    {
      priority      = 171
      paths         = ["/api/*"]
      methods       = ["OPTIONS"]
      authenticated = false
    },
    {
      priority      = 172
      paths         = ["/api/*"]
      authenticated = true
    }
  ]
}
