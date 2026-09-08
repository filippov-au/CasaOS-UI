<template>
	<div class="modal-card">
		<!-- Modal-Card Header Start -->
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-header">{{ $t('Update') }}</h3>
			</div>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click.native="$emit('close');" />
		</header>
		<!-- Modal-Card Header End -->
		<!-- Modal-Card Body Start -->
		<section class="modal-card-body ">
			<div class="node-card fixed-height">
				<div v-if="!isUpdating" class="update-info-container  is-size-14px" v-dompurify-html="markdownToHtml"></div>
				<div v-else class="update-info-container  is-size-14px" v-dompurify-html="updateMarkdownHtml"></div>
			</div>
		</section>
		<!-- Modal-Card Body End -->
		<!-- Modal-Card Footer Start-->
		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<div>
				<b-button :label="$t('Upgrade Now')" :loading="isUpdating" expaned rounded type="is-primary"
						  @click="updateSystem"/>
			</div>
		</footer>
		<!-- Modal-Card Footer End -->
	</div>
</template>

<script>
import {marked} from 'marked'

export default {
	props: {
        sourceMode: { type: Boolean, default: false },
        sourceRunning: { type: Boolean, default: false },
		changeLog: {
			type: String,
			default: ""
		},
	},
	data() {
		return {
			timer: 0,
			updateTimer: 0,
			isUpdating: false,
			markdown: ``,
			updateLogs: ``
		};
	},
	mounted() {
        if (this.sourceRunning) {
            this.isUpdating = true;
            this.getUpdateLogs();
        }
    },
    beforeDestroy() {
        clearInterval(this.timer);
        clearInterval(this.updateTimer);
    },
	computed: {
		markdownToHtml() {
			return marked.parse(this.changeLog);
		},
		updateMarkdownHtml() {

			return marked.parse(this.updateLogs);
		}
	},
	methods: {
		/**
		 * @description: Update System Version and check update state
		 * @return {*} void
		 */
		async updateSystem() {
            if (this.isUpdating) return;
            this.isUpdating = true;
            try {
                await this.$api.sys.updateCasaOS();
                this.getUpdateLogs();
            } catch (error) {
                this.isUpdating = false;
                this.$buefy.toast.open({
                    message: error?.response?.data?.message || this.$t('Unable to start update'),
                    type: 'is-danger',
                });
            }
        },

		/**
		 * @description: Get update logs
		 * @return {*} void
		 */
		getUpdateLogs() {
            clearInterval(this.updateTimer);
            const poll = async () => {
                try {
                    const res = await this.$api.file.getContent('/var/log/casaos/upgrade.log');
                    if (this._isDestroyed) return;
                    this.updateLogs = res.data.data || '';
                    // Match final status lines, not arbitrary compiler or test output.
                    const finalLine = this.updateLogs.trim().split('\n').pop();
                    if (this.sourceMode ? finalLine === 'CasaOS upgrade successfully' : this.updateLogs.includes('CasaOS upgrade successfully')) {
                        clearInterval(this.updateTimer);
                        localStorage.setItem('is_update', 'true');
                        this.$router.replace({ path: '/logout' });
                    } else if (this.sourceMode ? finalLine === 'CasaOS upgrade failed' : this.updateLogs.includes('CasaOS upgrade failed')) {
                        clearInterval(this.updateTimer);
                        this.isUpdating = false;
                        this.$buefy.toast.open({
                            message: this.$t('There seems to be a problem with the upgrade process, please try again!'),
                            type: 'is-danger',
                        });
                    }
                } catch (error) {
                    // CasaOS briefly disappears while the independent updater restarts it.
                    // Keep polling so the same dialog reconnects and shows the final result.
                }
            };
            this.updateTimer = setInterval(poll, 2000);
            poll();
        },

		/**
		 * @description: check update state if is_need is false then reload page
		 * @return {*} void
		 */
		checkUpdateState() {
			this.timer = setInterval(() => {
				this.$api.sys.getVersion().then(res => {
					if (res.data.success == 200) {
						if (!res.data.data.is_need) {
							clearInterval(this.timer);
							location.reload();
						}
					}
				})
			}, 3000)
		},
	},
}
</script>

<style lang="scss">
.fixed-height {
	max-height: 20rem;
	overflow-y: auto;
}

.update-info-container {
	line-height: 1.5rem;
	border-radius: 4px;
	overflow: hidden;
	min-height: 20rem;

	h1,
	h2,
	h3,
	h4,
	h5,
	h6 {
		font-weight: bold;
		margin-bottom: 0.4rem;
	}

	h1 {
		font-size: 2em;
	}

	h2 {
		font-size: 1.5em;
	}

	h3 {
		font-size: 1.17em;
	}

	h4 {
		font-size: 1em;
	}

	h5 {
		font-size: 0.83em;
	}

	h6 {
		font-size: 0.67em;
	}

	ul {
		margin-bottom: 0.5em;

		li {
			list-style: disc;
			margin-left: 1rem;
		}
	}
}
</style>
