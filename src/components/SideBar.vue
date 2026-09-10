<script>
import vueCustomScrollbar from 'vue-custom-scrollbar'
import 'vue-custom-scrollbar/dist/vueScrollbar.css'

const widgetsComponents = require.context(
  '@/widgets',
  false,
  /.vue$/,
)

export default {
  name: 'SideBar',
  components: {
    VueCustomScrollbar: vueCustomScrollbar,
  },
  data() {
    return {
      widgets: [],
      scrollSettings: {
        suppressScrollY: false,
        suppressScrollX: true,
        wheelPropagation: false,
      },
    }
  },
  computed: {
    sidebarOpen() {
      return this.$store.state.sidebarOpen
    },
  },
  created() {
    this.widgets = widgetsComponents.keys().map(fileName => widgetsComponents(fileName).default)
  },
  mounted() {
    window.addEventListener('resize', this.handleResize)
    this.handleResize()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
  },

  methods: {
    handleResize() {
      const ww = window.innerWidth
      const parentWidth = document.querySelector('.slider-content').offsetWidth
      this.$nextTick(() => {
        const padding = ww <= 480 ? 0 : -16
        this.$refs.sidebar.style.width = `${parentWidth + padding}px`
      })
    },
  },
}
</script>

<template>
  <div ref="sidebar" :class="{ open: sidebarOpen }" class="side-bar contextmenu-canvas">
    <VueCustomScrollbar :settings="scrollSettings" class="scroll-area contextmenu-canvas">
      <div v-for="(widget, index) in widgets" :key="`widgets_${index}`">
        <component :is="widget" :class="{ 'last-block': index === widgets.length - 1 }" />
      </div>
    </VueCustomScrollbar>
  </div>
</template>

<style lang="scss">
.side-bar {
    z-index: 10;
    // height: calc(100vh - 6rem);
    height: calc(var(--vh, 1vh) * 100 - 6rem);
    overflow: inherit !important;
    position: fixed;

    @include until(480px) {
        z-index: 20;
        left: 0rem;
        width: auto;
        margin: 0 0 0 1rem !important;
        transform: translateX(-100vw);
        transition: all 0.3s ease-in-out;

        &.open {
            transform: translateX(0);
        }
    }
}

.scroll-area {
    position: relative;
    padding: 0 16px 0 0;
    margin-right: -16px;
    max-height: calc(100% - 7.5rem);
    overflow-x: inherit !important;
    overflow-y: hidden !important;

    @include until(480px) {
        max-height: calc(100% - 4rem);
        height: 100% !important;
    }
}

.ps__thumb-x,
.ps__thumb-y {
    background-color: rgba(255, 255, 255, 0.4);
    width: 8px;
    right: 5px;
}

.ps:hover>.ps__rail-x,
.ps:hover>.ps__rail-y,
.ps--focus>.ps__rail-x,
.ps--focus>.ps__rail-y,
.ps--scrolling-x>.ps__rail-x,
.ps--scrolling-y>.ps__rail-y {
    opacity: 0.6;
    width: 8px;
}

.ps .ps__rail-x:hover,
.ps .ps__rail-y:hover,
.ps .ps__rail-x:focus,
.ps .ps__rail-y:focus,
.ps .ps__rail-x.ps--clicking,
.ps .ps__rail-y.ps--clicking {
    background-color: transparent;
    opacity: 0.6;
}

.ps__rail-x:hover>.ps__thumb-x,
.ps__rail-x:focus>.ps__thumb-x,
.ps__rail-x.ps--clicking .ps__thumb-x {
    height: 8px;
}

.ps__rail-y:hover>.ps__thumb-y,
.ps__rail-y:focus>.ps__thumb-y,
.ps__rail-y.ps--clicking .ps__thumb-y {
    width: 8px;
}
</style>
