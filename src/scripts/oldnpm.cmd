@rem run older node and npm for version 1 of package lock file

docker run --rm -it -v %cd%:/app --entrypoint /bin/bash --workdir /app node:14.15.0