FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 7880
CMD ["nginx", "-g", "daemon off;"]
