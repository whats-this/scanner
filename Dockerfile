FROM buildpack-deps:jessie

MAINTAINER Dean Sheather <dean@deansheather.com>

# add Node.js repository to apt
RUN curl -sL https://deb.nodesource.com/setup_6.x | bash -

# install Node.js and ClamAV
RUN apt-get update \
    && apt-get install -y -qq --force-yes nodejs \
                                          clamav \
                                          clamav-freshclam \
                                          ca-certificates

# make the container smaller
RUN apt-get clean
RUN rm -rf /var/lib/apt

# update virus database using freshclam
RUN freshclam

# copy source files into container
COPY index.js src/
COPY package.json src/
COPY lib/ src/lib

WORKDIR src/

# update NPM dependencies
RUN npm install

# start the consumer
CMD ["node", "index.js"]
