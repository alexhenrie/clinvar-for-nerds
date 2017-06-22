all:

db:
	./setup/npm-install.sh
	./setup/wget-deps.sh
	./setup/generate-schema.js
	./setup/import-database.sh
	./setup/generate-examples.js
	./setup/create-indexes.js

install:
	./node_modules/webpack/bin/webpack.js
	mkdir -p /opt/clinvar-for-nerds
	cp -r * /opt/clinvar-for-nerds
	cp clinvar-for-nerds.service /etc/systemd/system
	cp clinvar-for-nerds-update.sh /etc/cron.monthy
	systemctl enable clinvar-for-nerds
	systemctl start clinvar-for-nerds

uninstall:
	rm -rf /opt/clinvar-for-nerds
	rm -f /etc/systemd/system/clinvar-for-nerds.service
	rm -f /etc/cron.monthly/clinvar-for-nerds-update.sh
