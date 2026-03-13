FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY wiim_control/ wiim_control/

EXPOSE 7881

CMD ["uvicorn", "wiim_control.main:app", "--host", "0.0.0.0", "--port", "7881"]
