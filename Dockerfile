# Math Puzzle Paint — static kid math practice site
FROM nginx:1.27-alpine

# Static site files
COPY index.html /usr/share/nginx/html/index.html
COPY css/       /usr/share/nginx/html/css/
COPY js/        /usr/share/nginx/html/js/

EXPOSE 80
